import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const tempDir = mkdtempSync(path.join(tmpdir(), "kpblog-api-test-"));
const databasePath = path.join(tempDir, "test.db");
let app: FastifyInstance;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.JWT_SECRET = "test-secret-for-api-tests-000000000";
  process.env.SITE_URL = "http://localhost:3001";
  process.env.TRUST_PROXY = "false";
  delete process.env.TRUST_PROXY_HEADER;

  const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(migration.status, 0, migration.stdout + migration.stderr);

  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

test("health endpoint reports real database state instead of a hardcoded ok", async () => {
  const healthy = await app.inject({ method: "GET", url: "/health" });
  assert.equal(healthy.statusCode, 200);
  const body = healthy.json();
  assert.equal(body.success, true);
  assert.equal(body.data.status, "ok");
  assert.equal(body.data.checks.database, "ok");
  assert.equal(body.data.version, "0.1.0");
  assert.ok(
    Number.isInteger(body.data.uptimeSeconds),
    "应报告进程运行时长，便于判断是否刚重启过"
  );
  // 降级路径（数据库不可达 → 503）在 tests/health.test.ts：
  // Prisma 客户端在模块加载时就读 DATABASE_URL，同一进程换不了库。
});

test("every response carries a request id that can be traced in logs", async () => {
  const generated = await app.inject({ method: "GET", url: "/api/public/settings" });
  const id = generated.headers["x-request-id"];
  assert.equal(typeof id, "string");
  assert.match(
    String(id),
    /^[0-9a-f-]{36}$/,
    "没有上游 ID 时应生成 UUID，而不是 Fastify 默认的进程内计数器"
  );

  // 上游（Nginx 等）传进来的 ID 要透传，才能把一条链路串起来。
  const inbound = "trace-abc-12345";
  const echoed = await app.inject({
    method: "GET",
    url: "/api/public/settings",
    headers: { "x-request-id": inbound },
  });
  assert.equal(echoed.headers["x-request-id"], inbound);

  // 请求头是攻击者可控的：畸形值必须被丢弃并替换，否则就是日志注入。
  for (const hostile of ["short", "has space here", "line\nbreak-injected", "x".repeat(200)]) {
    const response = await app.inject({
      method: "GET",
      url: "/api/public/settings",
      headers: { "x-request-id": hostile },
    });
    const returned = String(response.headers["x-request-id"]);
    assert.notEqual(returned, hostile, `恶意请求 ID 不应被透传: ${JSON.stringify(hostile)}`);
    assert.match(returned, /^[0-9a-f-]{36}$/, "应替换为重新生成的 UUID");
  }
});

test("public endpoints return stable response envelopes", async () => {
  const settings = await app.inject({ method: "GET", url: "/api/public/settings" });
  assert.equal(settings.statusCode, 200);
  assert.equal(settings.json().success, true);

  const articles = await app.inject({ method: "GET", url: "/api/articles?limit=10" });
  assert.equal(articles.statusCode, 200);
  assert.equal(articles.json().success, true);
  assert.deepEqual(articles.json().data.items, []);
});

test("protected mutations reject anonymous callers", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/articles",
    headers: { origin: "http://localhost:3001" },
    payload: { title: "No session", content: "Should fail" },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
});

test("rate limits keep direct clients in separate buckets when proxy trust is disabled", async () => {
  // 每次使用不同的 identifier：否则账号维度的限流（10 次失败）会先于
  // IP 维度的限流（20 次）触发，这个测试就测不到 IP 分桶了。
  const request = (remoteAddress: string, index: number) => app.inject({
    method: "POST",
    url: "/api/auth/login",
    remoteAddress,
    headers: { origin: "http://localhost:3001" },
    payload: { identifier: `missing-user-${index}`, password: "incorrect-password" },
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal((await request("192.0.2.10", attempt)).statusCode, 401);
  }
  assert.equal((await request("192.0.2.10", 1000)).statusCode, 429);
  assert.equal((await request("192.0.2.11", 1001)).statusCode, 401);
});

test("admin reads use the account's current database role", async () => {
  const { createToken } = await import("../src/lib/auth");
  const { prisma } = await import("../src/lib/prisma");

  const admin = await prisma.user.create({
    data: {
      username: "read-access-admin",
      password: "unused",
      role: "ADMIN",
    },
  });
  const draft = await prisma.post.create({
    data: {
      slug: "demotion-test-draft",
      title: "Demotion Test Draft",
      content: "Private draft content",
      published: false,
    },
  });
  const token = await createToken({
    userId: admin.id,
    username: admin.username,
    role: "ADMIN",
    displayName: null,
    // 令牌必须带上会话代次，否则会被当作历史令牌拒绝。
    tokenVersion: admin.tokenVersion,
  });
  const headers = { cookie: `session=${token}` };

  const beforeDemotion = await app.inject({
    method: "GET",
    url: "/api/articles?published=all",
    headers,
  });
  assert.equal(beforeDemotion.statusCode, 200);
  assert.equal(
    beforeDemotion.json().data.items.some((post: { id: string }) => post.id === draft.id),
    true
  );

  await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });

  const afterDemotion = await app.inject({
    method: "GET",
    url: "/api/articles?published=all",
    headers,
  });
  assert.equal(afterDemotion.statusCode, 200);
  assert.equal(
    afterDemotion.json().data.items.some((post: { id: string }) => post.id === draft.id),
    false
  );

  const draftResponse = await app.inject({
    method: "GET",
    url: `/api/articles/${draft.id}`,
    headers,
  });
  assert.equal(draftResponse.statusCode, 404);

  const commentsResponse = await app.inject({
    method: "GET",
    url: "/api/comments",
    headers,
  });
  assert.equal(commentsResponse.statusCode, 403);
});

test("public home endpoint returns recent posts, categories, and tags", async () => {
  const { prisma } = await import("../src/lib/prisma");

  const category = await prisma.category.create({
    data: { name: "HomeCat", slug: "home-cat" },
  });
  const tag = await prisma.tag.create({ data: { name: "HomeTag", slug: "home-tag" } });
  await prisma.post.create({
    data: {
      slug: "home-post",
      title: "Home Post",
      content: "Home page content",
      published: true,
      publishedAt: new Date("2026-07-13T00:00:00.000Z"),
      categoryId: category.id,
      tags: { create: [{ tagId: tag.id }] },
    },
  });

  const response = await app.inject({ method: "GET", url: "/api/public/home" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.success, true);
  assert.ok(body.data.recentPosts.some((p: { slug: string }) => p.slug === "home-post"));
  assert.ok(body.data.categories.some((c: { slug: string }) => c.slug === "home-cat"));
  assert.ok(body.data.tags.some((t: { slug: string }) => t.slug === "home-tag"));
});

test("public adjacent endpoint returns previous, next, and related articles", async () => {
  const { prisma } = await import("../src/lib/prisma");

  // Isolate this test from posts created by earlier tests in the shared database.
  await prisma.post.deleteMany();

  const category = await prisma.category.create({
    data: { name: "AdjCat", slug: "adj-cat" },
  });
  const createPost = (slug: string, title: string, at: string) =>
    prisma.post.create({
      data: {
        slug,
        title,
        content: `${title} content`,
        published: true,
        publishedAt: new Date(at),
        categoryId: category.id,
      },
    });

  await createPost("adj-first", "First", "2026-07-11T00:00:00.000Z");
  await createPost("adj-middle", "Middle", "2026-07-12T00:00:00.000Z");
  await createPost("adj-last", "Last", "2026-07-13T00:00:00.000Z");

  const response = await app.inject({
    method: "GET",
    url: "/api/public/articles/adj-middle/adjacent",
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.previous.slug, "adj-first");
  assert.equal(body.data.next.slug, "adj-last");
  assert.ok(body.data.related.length >= 1);
  assert.ok(body.data.related.every((p: { slug: string }) => p.slug !== "adj-middle"));

  const missing = await app.inject({
    method: "GET",
    url: "/api/public/articles/nonexistent-slug/adjacent",
  });
  assert.equal(missing.statusCode, 200);
  assert.equal(missing.json().data, null);
});

test("login failures are limited per account even when the attacker rotates IPs", async () => {
  const attempt = (remoteAddress: string, identifier: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress,
      headers: { origin: "http://localhost:3001" },
      payload: { identifier, password: "incorrect-password" },
    });

  const victim = `victim-${Date.now()}`;
  const bystander = `bystander-${Date.now()}`;

  // 每次换一个 IP，使得 IP 维度的限流（20 次/15 分钟）不会触发，
  // 从而确保这里验证的是账号维度的限制。
  for (let index = 0; index < 10; index += 1) {
    const response = await attempt(`198.51.100.${index + 1}`, victim);
    assert.equal(response.statusCode, 401, `第 ${index + 1} 次失败应为 401`);
  }

  const blocked = await attempt("198.51.100.200", victim);
  assert.equal(blocked.statusCode, 429, "同一账号跨 IP 连续失败必须被拦住");

  // 其它账号不受影响：证明这是账号维度，而不是把所有登录一起限死。
  const other = await attempt("198.51.100.201", bystander);
  assert.equal(other.statusCode, 401);
});

test("a successful login clears the account failure counter", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { hashPassword } = await import("../src/lib/auth");

  const identifier = `clear-${Date.now()}`;
  await prisma.user.create({
    data: {
      username: identifier,
      password: await hashPassword("correct-horse-battery-staple"),
      role: "USER",
    },
  });

  const attempt = (remoteAddress: string, password: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress,
      headers: { origin: "http://localhost:3001" },
      payload: { identifier, password },
    });

  // 先失败 9 次（上限是 10，尚未触发）
  for (let index = 0; index < 9; index += 1) {
    assert.equal((await attempt(`203.0.113.${index + 1}`, "wrong-password")).statusCode, 401);
  }

  // 成功登录一次应当清零，正常用户不该为之前的输错持续买单
  const ok = await attempt("203.0.113.100", "correct-horse-battery-staple");
  assert.equal(ok.statusCode, 200);

  // 清零后再失败 9 次仍不应触发账号限流
  for (let index = 0; index < 9; index += 1) {
    assert.equal((await attempt(`203.0.113.${index + 101}`, "wrong-password")).statusCode, 401);
  }
});

test("logout revokes the token server-side instead of only clearing the cookie", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { createToken, hashPassword } = await import("../src/lib/auth");

  const user = await prisma.user.create({
    data: {
      username: `revoke-${Date.now()}`,
      password: await hashPassword("pw-123456789"),
      role: "USER",
    },
  });
  const token = await createToken({
    userId: user.id,
    username: user.username,
    role: "USER",
    displayName: null,
    tokenVersion: user.tokenVersion,
  });
  const headers = { cookie: `session=${token}`, origin: "http://localhost:3001" };

  assert.equal(
    (await app.inject({ method: "GET", url: "/api/auth/me", headers })).statusCode,
    200,
    "登出前会话应有效"
  );

  assert.equal(
    (await app.inject({ method: "POST", url: "/api/auth/logout", headers })).statusCode,
    200
  );

  // 关键断言：客户端继续携带同一个令牌也必须被拒绝。
  // 修复前 logoutCurrentUser 是空实现，令牌会一直有效到 7 天有效期结束。
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/auth/me", headers })).statusCode,
    401,
    "登出后同一令牌必须立即失效"
  );

  const after = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(after?.tokenVersion, 1, "登出应自增会话代次");
});

test("tokens are rejected when the session version is missing, stale or ahead", async () => {
  const { SignJWT } = await import("jose");
  const { prisma } = await import("../src/lib/prisma");
  const { getJwtSecret } = await import("../src/lib/env");

  const user = await prisma.user.create({
    data: { username: `version-${Date.now()}`, password: "unused", role: "USER" },
  });

  const mint = (payload: Record<string, unknown>) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(getJwtSecret()));

  const call = async (token: string) =>
    (
      await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: `session=${token}` },
      })
    ).statusCode;

  const base = { userId: user.id, username: user.username, role: "USER" };

  // 历史令牌：没有代次字段，一律拒绝。
  assert.equal(await call(await mint(base)), 401, "缺少 tokenVersion 的令牌应被拒绝");

  // 正确代次可用。
  assert.equal(await call(await mint({ ...base, tokenVersion: 0 })), 200);

  // 服务端把代次推进一代（等价于改密 / 管理员踢下线）。
  await prisma.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
  });

  // 旧令牌（代次落后）随即失效 —— 这正是「改密后踢下线」所依赖的行为。
  assert.equal(await call(await mint({ ...base, tokenVersion: 0 })), 401, "过期代次的令牌应被拒绝");

  // 伪造一个更超前的代次也不行。
  assert.equal(await call(await mint({ ...base, tokenVersion: 99 })), 401, "超前代次的令牌应被拒绝");

  // 新代次可用。
  assert.equal(await call(await mint({ ...base, tokenVersion: 1 })), 200);
});

test("malformed request bodies are reported as client errors, not server errors", async () => {
  const headers = { origin: "http://localhost:3001", "content-type": "application/json" };

  // 畸形 JSON
  const malformed = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: "{not valid json",
  });
  assert.equal(malformed.statusCode, 400, "畸形 JSON 应返回 400 而不是 500");
  assert.equal(malformed.json().success, false);
  // 只返回泛化信息，不回显框架细节
  assert.equal(malformed.json().error.message, "请求格式不正确");

  // 声明 JSON 但 body 为空
  const empty = await app.inject({ method: "POST", url: "/api/auth/login", headers });
  assert.equal(empty.statusCode, 400, "空 JSON body 应返回 400 而不是 500");

  // 正常的业务错误仍保持各自的语义
  const unauthorized = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers,
    payload: { identifier: "nobody-here", password: "wrong-password" },
  });
  assert.equal(unauthorized.statusCode, 401);

  // 未认证依旧 401，而不是被这条逻辑影响
  const anonymous = await app.inject({
    method: "POST",
    url: "/api/articles",
    headers: { origin: "http://localhost:3001" },
    payload: { title: "x", content: "y" },
  });
  assert.equal(anonymous.statusCode, 401);
});

test("profile is publicly readable and only writable by an admin session", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { createToken, hashPassword } = await import("../src/lib/auth");

  const origin = "http://localhost:3001";

  // 公开读取：未登录也能拿到（可能为空的）个人资料
  const anonRead = await app.inject({ method: "GET", url: "/api/public/profile" });
  assert.equal(anonRead.statusCode, 200);
  assert.equal(anonRead.json().success, true);
  assert.deepEqual(anonRead.json().data.socialLinks, []);

  // 未登录写入：401
  const anonWrite = await app.inject({
    method: "PUT",
    url: "/api/profile",
    headers: { origin },
    payload: { name: "nobody" },
  });
  assert.equal(anonWrite.statusCode, 401);

  // 普通用户写入：403
  const plain = await prisma.user.create({
    data: { username: `plain-${Date.now()}`, password: await hashPassword("pw-123456789"), role: "USER" },
  });
  const plainToken = await createToken({
    userId: plain.id, username: plain.username, role: "USER",
    displayName: null, tokenVersion: plain.tokenVersion,
  });
  const plainWrite = await app.inject({
    method: "PUT",
    url: "/api/profile",
    headers: { origin, cookie: `session=${plainToken}` },
    payload: { name: "not allowed" },
  });
  assert.equal(plainWrite.statusCode, 403);

  // 管理员写入：成功，且公开读取立刻反映
  const admin = await prisma.user.create({
    data: { username: `admin-${Date.now()}`, password: await hashPassword("pw-123456789"), role: "ADMIN" },
  });
  const adminToken = await createToken({
    userId: admin.id, username: admin.username, role: "ADMIN",
    displayName: null, tokenVersion: admin.tokenVersion,
  });

  const saved = await app.inject({
    method: "PUT",
    url: "/api/profile",
    headers: { origin, cookie: `session=${adminToken}` },
    payload: {
      name: "鲲鹏",
      headline: "CS 学生",
      bio: "简介",
      now: "近况",
      socialLinks: [{ label: "GitHub", href: "https://github.com/x" }],
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().data.name, "鲲鹏");

  const publicRead = await app.inject({ method: "GET", url: "/api/public/profile" });
  assert.equal(publicRead.json().data.name, "鲲鹏");
  assert.deepEqual(publicRead.json().data.socialLinks, [
    { label: "GitHub", href: "https://github.com/x" },
  ]);

  // 校验失败：400 而不是 500
  const invalid = await app.inject({
    method: "PUT",
    url: "/api/profile",
    headers: { origin, cookie: `session=${adminToken}` },
    payload: { avatar: "javascript:alert(1)" },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.code, "BAD_REQUEST");

  // 写入失败不应破坏已保存的内容
  const stillThere = await app.inject({ method: "GET", url: "/api/public/profile" });
  assert.equal(stillThere.json().data.name, "鲲鹏");
});

test("editing an article keeps its slug unless a new slug is supplied", async () => {
  // 回归：updateArticle 曾用 `slugify(slugInput || title || existing.title)` 计算 slug，
  // 于是「只改正文」也会按标题重算 URL，把已发布文章的链接换掉、断掉外链与搜索引擎收录。
  const { prisma } = await import("../src/lib/prisma");
  const { createToken, hashPassword } = await import("../src/lib/auth");
  const origin = "http://localhost:3001";

  const admin = await prisma.user.create({
    data: {
      username: `slug-admin-${Date.now()}`,
      password: await hashPassword("pw-123456789"),
      role: "ADMIN",
    },
  });
  const token = await createToken({
    userId: admin.id,
    username: admin.username,
    role: "ADMIN",
    displayName: null,
    tokenVersion: admin.tokenVersion,
  });

  const created = await prisma.post.create({
    data: {
      slug: "stable-slug-post",
      title: "一个中文标题",
      content: "初始正文",
      published: true,
      publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    },
  });

  // 只改正文，不传 slug
  const contentOnly = await app.inject({
    method: "PUT",
    url: `/api/articles/${created.id}`,
    headers: { origin, cookie: `session=${token}` },
    payload: { content: "更新后的正文" },
  });
  assert.equal(contentOnly.statusCode, 200);
  assert.equal(contentOnly.json().data.slug, "stable-slug-post");

  // 改标题也不应该动 slug
  const titleChanged = await app.inject({
    method: "PUT",
    url: `/api/articles/${created.id}`,
    headers: { origin, cookie: `session=${token}` },
    payload: { title: "换了一个完全不同的标题" },
  });
  assert.equal(titleChanged.statusCode, 200);
  assert.equal(titleChanged.json().data.slug, "stable-slug-post");

  // 显式传 slug 时才允许变更
  const slugChanged = await app.inject({
    method: "PUT",
    url: `/api/articles/${created.id}`,
    headers: { origin, cookie: `session=${token}` },
    payload: { slug: "renamed-post" },
  });
  assert.equal(slugChanged.statusCode, 200);
  assert.equal(slugChanged.json().data.slug, "renamed-post");
});
