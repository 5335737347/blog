import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { SignJWT } from "jose";

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const tempDir = mkdtempSync(path.join(tmpdir(), "kpblog-test-"));
const databasePath = path.join(tempDir, "test.db");

/** 公开评论列表已改为分页；测试里一次取够，避免断言被分页边界干扰。 */
const PAGE = { page: 1, pageSize: 100 };

before(() => {
  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.JWT_SECRET = "test-secret-for-service-tests-000000";
  process.env.SITE_URL = "http://localhost:3000";

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

after(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  rmSync(tempDir, { recursive: true, force: true });
});

test("publishes markdown with frontmatter, taxonomy, and generated URL", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { publishMarkdown } = await import("../src/server/publishing/publishing-service");

  const result = await publishMarkdown({
    content: `---
title: Smoke Test Post
slug: smoke-test-post
tags: [Next.js, Prisma]
category: Smoke
published: true
date: 2026-07-13
---

# Smoke Test Post

Publishing should keep Markdown content and extract #service-test.
`,
  });

  assert.equal(result.post.slug, "smoke-test-post");
  assert.equal(result.post.published, true);
  assert.equal(result.post.url, "http://localhost:3000/articles/smoke-test-post");

  const post = await prisma.post.findUnique({
    where: { slug: "smoke-test-post" },
    include: { category: true, tags: { include: { tag: true } } },
  });

  assert.ok(post);
  assert.equal(post.category?.slug, "smoke");
  assert.deepEqual(
    post.tags.map((item) => item.tag.slug).sort(),
    ["nextjs", "prisma", "service-test"]
  );
});

test("creates, moderates, and lists public comments without exposing email", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const {
    createComment,
    listPublicComments,
    moderateComment,
  } = await import("../src/server/comments/comment-service");

  const post = await prisma.post.create({
    data: {
      slug: "comment-target",
      title: "Comment Target",
      content: "Published post for comment tests.",
      published: true,
      publishedAt: new Date("2026-07-13T00:00:00.000Z"),
    },
  });

  const created = await createComment({
    postId: post.id,
    author: "Reader",
    email: "reader@example.com",
    content: "Looks good.",
  });

  assert.equal(created.pendingReview, true);
  assert.deepEqual((await listPublicComments(post.id, PAGE)).items, []);

  await moderateComment(created.id, { approved: true });
  const comments = (await listPublicComments(post.id, PAGE)).items;

  assert.equal(comments.length, 1);
  assert.equal(comments[0].author, "Reader");
  assert.equal("email" in comments[0], false);
});

test("article service separates public drafts from admin listings", async () => {
  const {
    createArticle,
    listArticles,
    updateArticle,
  } = await import("../src/server/articles/article-service");

  const draft = await createArticle({
    title: "Draft Article",
    slug: "draft-article",
    content: "Draft content",
    published: false,
  });

  let publicArticles = await listArticles({ page: 1, pageSize: 10, isAdmin: false });
  assert.equal(
    publicArticles.items.some((article) => article.slug === "draft-article"),
    false
  );

  const adminDrafts = await listArticles({
    page: 1,
    pageSize: 10,
    isAdmin: true,
    published: "draft",
  });
  assert.equal(adminDrafts.items.some((article) => article.id === draft.id), true);

  await updateArticle(draft.id, { published: true });
  publicArticles = await listArticles({ page: 1, pageSize: 10, isAdmin: false });
  assert.equal(
    publicArticles.items.some((article) => article.slug === "draft-article"),
    true
  );
});

test("article mutations normalize slugs and reject missing taxonomy references", async () => {
  const { createArticle } = await import("../src/server/articles/article-service");

  const article = await createArticle({
    title: "Normalized Slug Article",
    slug: "  Normalized Slug / Article  ",
    content: "Article body",
  });
  assert.equal(article.slug, "normalized-slug-article");

  await assert.rejects(
    () => createArticle({
      title: "Invalid Taxonomy Article",
      content: "Article body",
      categoryId: "missing-category",
    }),
    { status: 400, message: "分类不存在" }
  );
});

test("publish API keys are stored as hashes and legacy keys are normalized", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { verifyPublishApiKey } = await import("../src/server/auth/auth-service");
  const rawApiKey = "kp_test_legacy_key";

  const user = await prisma.user.create({
    data: {
      username: "api-key-admin",
      password: "unused",
      apiKey: rawApiKey,
      role: "ADMIN",
    },
  });

  const verified = await verifyPublishApiKey(rawApiKey);
  assert.equal(verified.id, user.id);

  const stored = await prisma.user.findUnique({
    where: { id: user.id },
    select: { apiKey: true },
  });

  assert.equal(
    stored?.apiKey,
    crypto.createHash("sha256").update(rawApiKey).digest("hex")
  );
});

test("publish API keys stop working when the owner is no longer an admin", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { verifyPublishApiKey } = await import("../src/server/auth/auth-service");
  const rawApiKey = "kp_test_demoted_admin_key";
  const apiKey = crypto.createHash("sha256").update(rawApiKey).digest("hex");

  await prisma.user.create({
    data: {
      username: "demoted-api-key-admin",
      password: "unused",
      apiKey,
      role: "USER",
    },
  });

  await assert.rejects(() => verifyPublishApiKey(rawApiKey), {
    status: 401,
    message: "无效的 API Key",
  });
});

test("rejects legacy session tokens that do not declare a role", async () => {
  const { verifyToken } = await import("../src/lib/auth");
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || "");
  const legacyToken = await new SignJWT({ userId: "legacy", username: "legacy-admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(secret);

  assert.equal(await verifyToken(legacyToken), null);
});

test("persists email codes and rate-limit counters in the database", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const {
    sendVerificationCode,
    assertVerificationCode,
  } = await import(
    "../src/server/auth/verification-code-service"
  );
  const { assertRateLimit } = await import("../src/server/request-guard");

  process.env.ALLOW_DEBUG_VERIFICATION_CODE = "true";
  try {
    const codeResult = await sendVerificationCode("register", "new-reader@example.com");
    assert.match(codeResult.debugCode || "", /^\d{6}$/);
    assert.match(codeResult.target, /new-reader@example\.com$/);
    await assertVerificationCode("register", "new-reader@example.com", codeResult.debugCode);
    assert.equal(await prisma.verificationCode.count(), 0);
  } finally {
    delete process.env.ALLOW_DEBUG_VERIFICATION_CODE;
  }

  await assertRateLimit("test:limit", 2, 60_000);
  await assertRateLimit("test:limit", 2, 60_000);
  await assert.rejects(() => assertRateLimit("test:limit", 2, 60_000), {
    status: 429,
  });
  assert.equal((await prisma.rateLimitBucket.findUnique({ where: { key: "test:limit" } }))?.count, 3);
});

test("refuses to hand out verification codes unless debug mode is explicitly enabled", async () => {
  const { sendVerificationCode, getRegistrationCapabilities } = await import(
    "../src/server/auth/verification-code-service"
  );

  // 默认（未显式开启）必须拒绝，并且不能把验证码回显给调用方。
  // 否则一旦部署时漏设 NODE_ENV，任何人都能拿到验证码并注册任意邮箱。
  delete process.env.ALLOW_DEBUG_VERIFICATION_CODE;
  await assert.rejects(
    () => sendVerificationCode("register", "nobody@example.com"),
    { status: 400 }
  );
  assert.equal(getRegistrationCapabilities().email, false);
});

test("computes previous/next neighbours from ordering keys instead of scanning all posts", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { createArticle } = await import("../src/server/articles/article-service");
  const { getArticleAdjacentData } = await import(
    "../src/server/public/public-service"
  );

  // 三篇已发布文章，publishedAt 依次递增：oldest < middle < newest。
  // 列表按 publishedAt DESC 排列，因此 newest 在首位。
  const base = Date.now() + 60_000;
  const slugs: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const created = await createArticle({
      title: `邻接测试 ${i}`,
      slug: `adjacent-${base}-${i}`,
      content: `内容 ${i}`,
      published: true,
    });
    await prisma.post.update({
      where: { id: created.id },
      data: { publishedAt: new Date(base + i * 60_000) },
    });
    slugs.push(created.slug);
  }

  const oldest = await getArticleAdjacentData(slugs[0]);
  assert.equal(oldest?.next?.slug, slugs[1], "较早文章的下一篇应为中间那篇");

  const middle = await getArticleAdjacentData(slugs[1]);
  assert.equal(middle?.previous?.slug, slugs[0], "上一篇应为更旧的文章");
  assert.equal(middle?.next?.slug, slugs[2], "下一篇应为更新的文章");

  const newest = await getArticleAdjacentData(slugs[2]);
  assert.equal(newest?.previous?.slug, slugs[1]);

  assert.equal(await getArticleAdjacentData("does-not-exist"), null);

  // 边界：用一个远未来的时间点确保它是全局最新，从而必然没有下一篇；
  // 远过去的时间点则必然没有上一篇。这样断言不依赖其它测试留下的数据。
  const future = await createArticle({
    title: "未来文章",
    slug: `adjacent-future-${base}`,
    content: "未来",
    published: true,
  });
  await prisma.post.update({
    where: { id: future.id },
    data: { publishedAt: new Date("2100-01-01T00:00:00Z") },
  });
  const futureAdjacent = await getArticleAdjacentData(future.slug);
  assert.equal(futureAdjacent?.next, null, "全局最新的文章不应有下一篇");
  assert.ok(futureAdjacent?.previous, "全局最新的文章应有上一篇");

  const past = await createArticle({
    title: "远古文章",
    slug: `adjacent-past-${base}`,
    content: "远古",
    published: true,
  });
  await prisma.post.update({
    where: { id: past.id },
    data: { publishedAt: new Date("2000-01-01T00:00:00Z") },
  });
  const pastAdjacent = await getArticleAdjacentData(past.slug);
  assert.equal(pastAdjacent?.previous, null, "全局最早的文章不应有上一篇");
  assert.ok(pastAdjacent?.next, "全局最早的文章应有下一篇");

  await prisma.post.deleteMany({ where: { id: { in: [future.id, past.id] } } });
});

test("keeps manually assigned tags when only the article content changes", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { createArticle, updateArticle } = await import(
    "../src/server/articles/article-service"
  );

  const manual = await prisma.tag.create({
    data: { name: "手工标签", slug: `manual-${Date.now()}` },
  });
  const post = await createArticle({
    title: "标签保留测试",
    content: "正文里没有井号标签。",
    tagIds: [manual.id],
  });
  assert.equal(post.tags.length, 1);

  // 只改正文、不传 tagIds：手工标签必须保留（此前会被静默清空）。
  const updated = await updateArticle(post.id, { content: "改过的正文，依然没有标签。" });
  assert.deepEqual(updated.tags.map((tag) => tag.slug), [manual.slug]);

  // 显式传 tagIds 时仍然按传入值整体替换。
  const updated2 = await updateArticle(post.id, { tagIds: [] });
  assert.equal(updated2.tags.length, 0);
});

test("only trusts configured origins once SITE_URL is set", async () => {
  const { assertSameOrigin } = await import("../src/server/request-guard");

  const request = (headers: Record<string, string>, origin = "http://127.0.0.1:3002") => ({
    headers: new Headers(headers),
    origin,
    directIp: "127.0.0.1",
  });

  const previousSite = process.env.SITE_URL;
  const previousPublic = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.SITE_URL = "https://kpblog.cc";
    delete process.env.NEXT_PUBLIC_SITE_URL;

    assert.doesNotThrow(() =>
      assertSameOrigin(request({ origin: "https://kpblog.cc" }))
    );

    // 关键：配置了可信来源后，Origin 与 Host 相同也不能放行，
    // 否则 Host 头可伪造时同源校验就形同虚设。
    assert.throws(
      () => assertSameOrigin(request({ origin: "https://evil.example" }, "https://evil.example")),
      { status: 403 }
    );
    assert.throws(
      () => assertSameOrigin(request({ origin: "https://evil.example" })),
      { status: 403 }
    );

    // 没有 Origin 时退回 Referer 判断。
    assert.throws(
      () => assertSameOrigin(request({ referer: "https://evil.example/post" })),
      { status: 403 }
    );
    assert.doesNotThrow(() =>
      assertSameOrigin(request({ referer: "https://kpblog.cc/post" }))
    );
  } finally {
    if (previousSite === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSite;
    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousPublic;
  }
});

test("public settings only expose explicitly allowed keys", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { getSettingsMap } = await import("../src/server/settings/settings-service");

  await prisma.setting.create({ data: { key: "private_token", value: "must-not-leak" } });
  const settings = await getSettingsMap();

  assert.equal("private_token" in settings, false);
});

test("rejects passwords beyond bcrypt's safe byte limit", async () => {
  const { loginUser } = await import("../src/server/auth/auth-service");

  await assert.rejects(
    () => loginUser({ identifier: "reader", password: "密".repeat(25) }),
    { status: 401 }
  );
});

test("rejects registration without a valid email", async () => {
  const { registerUser } = await import("../src/server/auth/auth-service");

  await assert.rejects(
    () => registerUser({
      username: "email-reader",
      email: "not-an-email",
      password: "valid-password",
    }),
    { status: 400, message: "邮箱格式不正确" }
  );
});

test("rejects login identifiers that collide across account fields", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { loginUser, registerUser } = await import("../src/server/auth/auth-service");

  await prisma.user.create({
    data: { username: "legacy-owner@example.com", password: "unused" },
  });

  await assert.rejects(
    () => registerUser({
      username: "new-reader",
      email: "legacy-owner@example.com",
      verificationCode: "000000",
      password: "valid-password",
    }),
    { status: 400, message: "用户名或邮箱已被使用" }
  );

  await prisma.user.create({
    data: {
      username: "legacy-second-owner",
      email: "legacy-owner@example.com",
      password: "unused",
    },
  });

  await assert.rejects(
    () => loginUser({ identifier: "legacy-owner@example.com", password: "unused" }),
    { status: 401, message: "用户名或密码错误" }
  );
});

test("does not trust client IP headers unless proxy trust is explicit", async () => {
  const { requestIp } = await import("../src/server/request-guard");
  const previousTrustProxy = process.env.TRUST_PROXY;
  const previousProxyHeader = process.env.TRUST_PROXY_HEADER;
  const request = {
    headers: new Headers({
      "x-real-ip": "203.0.113.8",
      "x-forwarded-for": "198.51.100.4, 10.0.0.1",
    }),
    directIp: "192.0.2.10",
  };

  try {
    delete process.env.TRUST_PROXY;
    assert.equal(requestIp(request), "192.0.2.10");

    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HEADER = "x-forwarded-for";
    assert.equal(requestIp(request), "198.51.100.4");

    process.env.TRUST_PROXY_HEADER = "unexpected-header";
    assert.equal(requestIp(request), "invalid-proxy-header");
  } finally {
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
    if (previousProxyHeader === undefined) delete process.env.TRUST_PROXY_HEADER;
    else process.env.TRUST_PROXY_HEADER = previousProxyHeader;
  }
});

test("slugify keeps Chinese titles readable instead of falling back to a hash", async () => {
  const { slugify } = await import("../src/lib/utils");

  assert.equal(slugify("数据库索引原理与优化实践"), "shu-ju-ku-suo-yin-yuan-li-yu-you-hua-shi-jian");
  assert.equal(slugify("CSS Grid 布局完全指南"), "css-grid-bu-ju-wan-quan-zhi-nan");
  assert.equal(slugify("测试"), "ce-shi");

  // 纯拉丁标题的行为必须保持不变。
  assert.equal(slugify("Hello World"), "hello-world");

  // 任何输入都不能返回空串，否则文章 URL 会退化成 /articles/。
  for (const input of ["", "   ", "!!!", "：：："]) {
    assert.notEqual(slugify(input), "");
  }

  // 超长拼音标题要在词边界截断，不能生成无上限的 URL。
  const long = slugify("数据库索引原理与优化实践深入理解哈希表从哈希函数到开放寻址以及更多更多的中文内容补充说明");
  assert.ok(long.length <= 80, `slug 过长: ${long.length}`);
  assert.ok(!long.endsWith("-"), `slug 不应以连字符结尾: ${long}`);
});

test("pagination and adjacent links share one total ordering when timestamps tie", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { createArticle, listArticles } = await import(
    "../src/server/articles/article-service"
  );
  const { getArticleAdjacentData } = await import("../src/server/public/public-service");

  // 批量导入场景：frontmatter 指定同一个 date 时，多篇文章的 publishedAt
  // （以及在快速批量插入下可能相同的 createdAt）会完全一致。
  const stamp = new Date("2031-03-03T03:03:03.000Z");
  const tag = `tie-${Date.now()}`;
  const mine: string[] = [];

  try {
    for (let i = 0; i < 7; i += 1) {
      const post = await createArticle({
        title: `平局文章 ${i}`,
        slug: `${tag}-${i}`,
        content: `内容 ${i}`,
        published: true,
      });
      await prisma.post.update({
        where: { id: post.id },
        data: { publishedAt: stamp, createdAt: stamp },
      });
      mine.push(post.slug);
    }

    // 分页遍历：每篇文章必须恰好出现一次（既不能漏，也不能重复）。
    const collected: string[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const result = await listArticles({ page, pageSize: 3, isAdmin: false });
      collected.push(...result.items.map((item) => item.slug));
    }
    const seen = collected.filter((slug) => mine.includes(slug));

    assert.equal(seen.length, mine.length, "分页必须恰好覆盖全部平局文章");
    assert.equal(new Set(seen).size, mine.length, "分页不能重复返回同一篇文章");

    // 邻接链必须与列表顺序一致：列表第 i 篇的「上一篇」就是第 i+1 篇。
    // 这正是修复前会分叉的地方（列表与邻接用了不同排序）。
    for (let i = 0; i + 1 < seen.length; i += 1) {
      const adjacent = await getArticleAdjacentData(seen[i]);
      assert.equal(
        adjacent?.previous?.slug,
        seen[i + 1],
        `列表第 ${i} 篇(${seen[i]})的上一篇应为 ${seen[i + 1]}，实际 ${adjacent?.previous?.slug}`
      );
    }
  } finally {
    await prisma.post.deleteMany({ where: { slug: { in: mine } } });
  }
});

test("listTags hides tags that have no published posts", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const { createArticle } = await import("../src/server/articles/article-service");
  const { listTags } = await import("../src/server/taxonomy/taxonomy-service");

  const stamp = Date.now();
  const withPost = await prisma.tag.create({
    data: { name: `pub-${stamp}`, slug: `pub-${stamp}` },
  });
  const draftOnly = await prisma.tag.create({
    data: { name: `draft-${stamp}`, slug: `draft-${stamp}` },
  });
  const orphan = await prisma.tag.create({
    data: { name: `orphan-${stamp}`, slug: `orphan-${stamp}` },
  });

  const published = await createArticle({
    title: "已发布文章",
    slug: `pub-post-${stamp}`,
    content: "正文",
    published: true,
    tagIds: [withPost.id],
  });
  const draft = await createArticle({
    title: "草稿文章",
    slug: `draft-post-${stamp}`,
    content: "正文",
    published: false,
    tagIds: [draftOnly.id],
  });

  try {
    const slugs = (await listTags()).map((tag) => tag.slug);
    assert.ok(slugs.includes(`pub-${stamp}`), "有已发布文章的标签应出现");
    assert.ok(!slugs.includes(`draft-${stamp}`), "只有草稿的标签不应出现在公开列表");
    assert.ok(!slugs.includes(`orphan-${stamp}`), "没有任何文章的标签不应出现");
  } finally {
    await prisma.post.deleteMany({ where: { id: { in: [published.id, draft.id] } } });
    await prisma.tag.deleteMany({
      where: { id: { in: [withPost.id, draftOnly.id, orphan.id] } },
    });
  }
});

test("treats loopback host aliases as the same origin (strict, production rules)", async () => {
  const { assertSameOrigin } = await import("../src/server/request-guard");

  const request = (origin: string) => ({
    headers: new Headers({ origin }),
    origin: "http://127.0.0.1:3002",
    directIp: "127.0.0.1",
  });

  const previousNodeEnv = process.env.NODE_ENV;
  const previousSite = process.env.SITE_URL;
  const previousPublic = process.env.NEXT_PUBLIC_SITE_URL;
  const previousAllowed = process.env.ALLOWED_ORIGINS;
  try {
    // 这一段验证严格规则，必须在生产模式下断言；开发模式会额外放宽本机地址。
    process.env.NODE_ENV = "production";
    process.env.SITE_URL = "http://localhost:3001";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.ALLOWED_ORIGINS;

    // 三种本机写法必须等价，否则经 127.0.0.1 访问时登录/评论/登出会全部 403。
    for (const origin of [
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://[::1]:3001",
    ]) {
      assert.doesNotThrow(() => assertSameOrigin(request(origin)), `${origin} 应被放行`);
    }

    // 端口不同仍属不同来源
    assert.throws(() => assertSameOrigin(request("http://127.0.0.1:9999")), { status: 403 });
    // 协议不同也属不同来源
    assert.throws(() => assertSameOrigin(request("https://localhost:3001")), { status: 403 });
    // 外部来源依旧拦截
    assert.throws(() => assertSameOrigin(request("http://evil.example")), { status: 403 });

    // 非本机的生产域名不会因为别名机制多出任何允许来源
    process.env.SITE_URL = "https://kpblog.cc";
    assert.doesNotThrow(() => assertSameOrigin(request("https://kpblog.cc")));
    assert.throws(() => assertSameOrigin(request("http://127.0.0.1:3001")), { status: 403 });

    // 显式补充来源，且能容忍空白与非法项
    process.env.ALLOWED_ORIGINS = " http://192.168.1.68:3001 , not-a-url ,";
    assert.doesNotThrow(() => assertSameOrigin(request("http://192.168.1.68:3001")));
    assert.throws(() => assertSameOrigin(request("http://192.168.1.69:3001")), { status: 403 });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSite === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSite;
    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousPublic;
    if (previousAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previousAllowed;
  }
});

test("development accepts this machine's own addresses so DHCP changes do not break it", async () => {
  const { networkInterfaces } = await import("node:os");
  const { assertSameOrigin } = await import("../src/server/request-guard");

  const request = (origin: string) => ({
    headers: new Headers({ origin }),
    origin: "http://127.0.0.1:3002",
    directIp: "127.0.0.1",
  });

  const previousNodeEnv = process.env.NODE_ENV;
  const previousSite = process.env.SITE_URL;
  const previousAllowed = process.env.ALLOWED_ORIGINS;
  try {
    delete process.env.NODE_ENV; // 开发
    process.env.SITE_URL = "http://localhost:3001";
    delete process.env.ALLOWED_ORIGINS;

    // 本机有线/无线网卡地址由 DHCP 分配、会变；不应要求把它们写进配置。
    const localIps = Object.values(networkInterfaces())
      .flatMap((addresses) => addresses ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => address.address);

    for (const ip of localIps) {
      // 端口也允许变化（dev server 可能换端口）
      assert.doesNotThrow(
        () => assertSameOrigin(request(`http://${ip}:3001`)),
        `${ip}:3001 是本机地址，开发环境应放行`
      );
      assert.doesNotThrow(() => assertSameOrigin(request(`http://${ip}:5173`)));
    }

    // 不是本机的地址照样拦截
    assert.throws(() => assertSameOrigin(request("http://10.1.2.3:3001")), { status: 403 });
    assert.throws(() => assertSameOrigin(request("http://evil.example")), { status: 403 });

    // 生产模式必须完全收回这条放宽规则
    process.env.NODE_ENV = "production";
    for (const ip of localIps) {
      assert.throws(
        () => assertSameOrigin(request(`http://${ip}:3001`)),
        { status: 403 },
        `生产环境不得因为本机网卡地址而放行 ${ip}`
      );
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSite === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSite;
    if (previousAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previousAllowed;
  }
});
