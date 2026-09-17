import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { createTestDatabase } from "./helpers/test-db";

/**
 * 用户旅程的端到端测试。
 *
 * 与其它测试的区别：这里**真的起 HTTP 服务器**，用真实 fetch 和真实 Cookie 走完整条
 * 链路，而不是 `app.inject()`。inject 绕过了网络层，因此看不见这些东西：
 *   - Cookie 的实际收发与属性（Set-Cookie → 下一次请求携带）
 *   - Origin 校验在真实请求头下的行为
 *   - 限流真的按来源计数，而不是被注入请求短路
 * 这些恰好是线上最容易出问题、又最难在单元测试里发现的部分。
 */
const database = createTestDatabase("kpblog-journey-test-");

let app: FastifyInstance;
let baseUrl: string;
let siteOrigin: string;

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** 极简 cookie jar：只记录 name=value，够用来验证会话是否真的跨请求保持。 */
class CookieJar {
  private readonly jar = new Map<string, string>();

  absorb(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index === -1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      // 过期或清空即视为删除。
      if (value === "" || /Max-Age=0/i.test(raw)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  header(): Record<string, string> {
    if (this.jar.size === 0) return {};
    return { cookie: [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ") };
  }

  get size() {
    return this.jar.size;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** null 表示刻意不带 Origin；不传则默认带站点 Origin（模拟浏览器）。 */
  origin?: string | null;
  headers?: Record<string, string>;
}

/**
 * 发一个真实 HTTP 请求。
 *
 * 响应体在这里**一次性**读掉并解析：之前把 `await res.text()` 写进断言的 message
 * 参数里，即使断言通过也会消费掉 body，后续再 `.json()` 就报 "Body is unusable"。
 */
async function call<T = unknown>(
  jar: CookieJar,
  path: string,
  options: RequestOptions = {}
): Promise<{ status: number; json: ApiEnvelope<T> }> {
  const headers: Record<string, string> = { ...jar.header(), ...options.headers };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const origin = options.origin === undefined ? siteOrigin : options.origin;
  if (origin) headers.origin = origin;

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  jar.absorb(response);

  const raw = await response.text();
  let json: ApiEnvelope<T>;
  try {
    json = raw ? (JSON.parse(raw) as ApiEnvelope<T>) : { success: false };
  } catch {
    json = { success: false };
  }
  return { status: response.status, json };
}

before(async () => {
  process.env.NODE_ENV = "test";
  // SMTP 已在 createTestDatabase() 里统一钉成空串，测试不会真的发信。
  process.env.TRUST_PROXY = "false";
  delete process.env.TRUST_PROXY_HEADER;

  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  const { hashPassword } = await import("../src/lib/auth");

  app = buildApp();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
  siteOrigin = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  await prisma.post.create({
    data: {
      slug: "journey-post",
      title: "旅程目标文章",
      content: "正文",
      published: true,
      publishedAt: new Date(),
    },
  });

  await prisma.user.create({
    data: {
      username: "journey-admin",
      email: "admin@example.com",
      password: await hashPassword("admin-password-12345"),
      role: "ADMIN",
    },
  });
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

test("a reader can register, comment, be moderated, and log out over real HTTP", async () => {
  const reader = new CookieJar();

  // 1) 注册需要邮箱验证码。测试环境用显式开关直接拿到它，不依赖 SMTP。
  const code = await call<{ debugCode?: string }>(reader, "/api/auth/verification-code", {
    method: "POST",
    body: { target: "reader@example.com" },
  });
  assert.equal(code.status, 200, JSON.stringify(code.json));
  const debugCode = code.json.data?.debugCode;
  assert.match(String(debugCode), /^\d{6}$/, "应返回 6 位调试验证码");

  // 2) 注册：服务端应通过 Set-Cookie 直接建立会话。
  const registered = await call(reader, "/api/auth/register", {
    method: "POST",
    body: {
      username: "journey-reader",
      password: "reader-password-12345",
      email: "reader@example.com",
      verificationCode: debugCode,
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.json));
  assert.ok(reader.size > 0, "注册后应拿到会话 Cookie");

  // 3) 会话要能在下一次请求里复用——这是 inject 测不出来的部分。
  const me = await call<{ username: string }>(reader, "/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.json.data?.username, "journey-reader");

  // 4) 提交评论：进入待审核。
  const index = await call<{ items: { id: string }[] }>(
    reader,
    "/api/public/article-index?limit=1"
  );
  const postId = index.json.data?.items[0]?.id;
  assert.ok(postId, "应能取到一篇已发布文章");

  const commented = await call<{ id: string }>(reader, "/api/comments", {
    method: "POST",
    body: { postId, content: "来自真实 HTTP 的评论" },
  });
  assert.equal(commented.status, 201, JSON.stringify(commented.json));
  const commentId = commented.json.data?.id;

  // 5) 未审核前公开列表看不到。
  const beforeApproval = await call<{ items: { id: string }[] }>(
    reader,
    `/api/comments?postId=${postId}`
  );
  assert.deepEqual(
    beforeApproval.json.data?.items.map((item) => item.id),
    [],
    "待审核评论不应公开可见"
  );

  // 6) 管理员登录并审核通过。
  const admin = new CookieJar();
  const login = await call(admin, "/api/auth/login", {
    method: "POST",
    body: { identifier: "journey-admin", password: "admin-password-12345" },
  });
  assert.equal(login.status, 200, JSON.stringify(login.json));

  const approved = await call(admin, `/api/comments/${commentId}`, {
    method: "PUT",
    body: { approved: true },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.json));

  // 7) 审核通过后公开可见，且不泄漏邮箱。
  const afterApproval = await call<{ items: { id: string; email?: string }[] }>(
    reader,
    `/api/comments?postId=${postId}`
  );
  assert.deepEqual(
    afterApproval.json.data?.items.map((item) => item.id),
    [commentId]
  );
  assert.equal("email" in (afterApproval.json.data?.items[0] ?? {}), false);

  // 8) 登出后会话立即失效（tokenVersion 吊销在真实 Cookie 链路上生效）。
  const logout = await call(reader, "/api/auth/logout", { method: "POST" });
  assert.equal(logout.status, 200, JSON.stringify(logout.json));

  // /api/auth/me 走的是 requireAuthSession，未登录时抛 401 而不是返回 data:null。
  const afterLogout = await call(reader, "/api/auth/me");
  assert.equal(afterLogout.status, 401, "登出后会话必须失效");
  assert.equal(afterLogout.json.success, false);
});

test("the test environment is pinned offline and cannot deliver real email", async () => {
  // 这条测试保护的是「其它测试不会真的发信」这件事本身。
  // 开发机上 .env.local 通常配好了 SMTP，一旦环境隔离被移除，
  // 上一条旅程测试就会真的通过服务商投递，而且未必有人注意到。
  const { smtpConfig } = await import("../src/server/auth/verification-code-service");
  assert.equal(
    smtpConfig(),
    null,
    "测试进程必须把 SMTP 钉成未配置（见 tests/helpers/offline-env.ts）"
  );
  assert.equal(process.env.ALLOW_DEBUG_VERIFICATION_CODE, "true");
});

test("state-changing requests from a foreign origin are rejected over real HTTP", async () => {
  const jar = new CookieJar();
  const { status, json } = await call(jar, "/api/comments", {
    method: "POST",
    origin: "https://evil.example",
    body: { postId: "whatever", content: "跨站请求" },
  });
  assert.equal(status, 403, "跨站来源必须被拒绝");
  assert.match(json.error?.message ?? "", /来源/);
});
