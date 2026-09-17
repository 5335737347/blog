import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { createTestDatabase } from "./helpers/test-db";

/**
 * 来源校验（CSRF 防线）矩阵：每一个变更类端点。
 *
 * 单个功能测试只会验证「正常来源能提交评论」，不会验证「伪造来源会被拒」。
 * 少写一处 `assertRequestOrigin` 不会有任何测试变红——所以这里把**全部**变更类
 * 端点列出来逐个打，新增端点忘记加保护时会立刻失败。
 *
 * 这条矩阵刻意不设豁免名单。`POST /api/publish` 用的是 Bearer 凭据、严格来说
 * 不需要 CSRF 防护，但它同样带上了来源校验，规则才能保持无例外。
 */
const database = createTestDatabase("kpblog-origin-test-");

let app: FastifyInstance;
let siteOrigin: string;

const FOREIGN_ORIGIN = "https://evil.example";

interface Endpoint {
  method: "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  label: string;
}

/** 全部变更类端点。新增 POST/PUT/DELETE 时这里必须同步。 */
const MUTATION_ENDPOINTS: Endpoint[] = [
  { method: "POST", path: "/api/articles", body: { title: "x", content: "y" }, label: "新建文章" },
  { method: "PUT", path: "/api/articles/absent", body: {}, label: "修改文章" },
  { method: "DELETE", path: "/api/articles/absent", label: "删除文章" },
  { method: "POST", path: "/api/auth/verification-code", body: { target: "a@b.com" }, label: "发送验证码" },
  { method: "POST", path: "/api/auth/register", body: {}, label: "注册" },
  { method: "POST", path: "/api/auth/login", body: {}, label: "登录" },
  { method: "POST", path: "/api/auth/password/reset-code", body: { target: "a@b.com" }, label: "发送重置码" },
  { method: "POST", path: "/api/auth/password/reset", body: {}, label: "重置密码" },
  { method: "PUT", path: "/api/auth/password", body: {}, label: "修改密码" },
  { method: "POST", path: "/api/auth/logout", body: {}, label: "登出" },
  { method: "POST", path: "/api/auth/key", body: {}, label: "轮换发布密钥" },
  { method: "POST", path: "/api/comments", body: {}, label: "发表评论" },
  { method: "POST", path: "/api/guestbook", body: {}, label: "发表留言" },
  { method: "PUT", path: "/api/comments/absent", body: {}, label: "审核评论" },
  { method: "DELETE", path: "/api/comments/absent", label: "删除评论" },
  { method: "POST", path: "/api/music", body: {}, label: "新增音乐" },
  { method: "DELETE", path: "/api/music/absent", label: "删除音乐" },
  { method: "PUT", path: "/api/profile", body: {}, label: "修改资料" },
  { method: "POST", path: "/api/publish", body: {}, label: "API 发布" },
  { method: "POST", path: "/api/import", body: {}, label: "批量导入" },
  { method: "PUT", path: "/api/settings", body: {}, label: "修改设置" },
];

async function call(endpoint: Endpoint, origin?: string) {
  const headers: Record<string, string> = {};
  if (origin !== undefined) headers.origin = origin;
  if (endpoint.body !== undefined) headers["content-type"] = "application/json";

  const response = await app.inject({
    method: endpoint.method,
    url: endpoint.path,
    headers,
    payload: endpoint.body,
  });
  let json: { error?: { code: string; message: string } } = {};
  try {
    json = response.body ? JSON.parse(response.body) : {};
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: response.statusCode, json };
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.TRUST_PROXY = "false";
  delete process.env.TRUST_PROXY_HEADER;

  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();
  siteOrigin = process.env.SITE_URL ?? "http://localhost:3000";
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

test("every state-changing endpoint rejects a foreign origin", async () => {
  for (const endpoint of MUTATION_ENDPOINTS) {
    const { status, json } = await call(endpoint, FOREIGN_ORIGIN);
    assert.equal(
      status,
      403,
      `${endpoint.label}（${endpoint.method} ${endpoint.path}）对跨站来源应返回 403，实际 ${status}`
    );
    assert.equal(json.error?.code, "FORBIDDEN", endpoint.label);
    // 必须是「来源非法」而不是「权限不足」——否则可能只是恰好没登录。
    assert.match(
      json.error?.message ?? "",
      /来源/,
      `${endpoint.label} 应因来源非法被拒，实际提示：${json.error?.message}`
    );
  }
});

test("the site's own origin is not rejected by the origin guard", async () => {
  for (const endpoint of MUTATION_ENDPOINTS) {
    const { status, json } = await call(endpoint, siteOrigin);
    assert.notEqual(
      status,
      403,
      `${endpoint.label} 不应把站内来源判为跨站（实际提示：${json.error?.message ?? ""}）`
    );
  }
});

test("requests without an Origin header pass the guard and reach normal authorization", async () => {
  // 设计如此：浏览器发跨站 POST 一定会带 Origin，因此「没有 Origin」只可能来自
  // 非浏览器客户端（curl、CLI、服务端代理），不是 CSRF 场景，放行后由各自的鉴权把关。
  for (const endpoint of MUTATION_ENDPOINTS) {
    const { status, json } = await call(endpoint);
    const rejectedByOrigin = status === 403 && /来源/.test(json.error?.message ?? "");
    assert.equal(
      rejectedByOrigin,
      false,
      `${endpoint.label} 无 Origin 时不应被来源校验拦下（实际提示：${json.error?.message ?? ""}）`
    );
    // 放行不等于授权：具体是 401 还是 400，取决于该端点自身是否需要登录，
    // 公开端点（如发送验证码）本就会返回 200，因此这里不锁定状态码。
  }
});
