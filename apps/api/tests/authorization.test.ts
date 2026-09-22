import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { createTestDatabase } from "./helpers/test-db";

/**
 * 授权矩阵：每一种角色 × 每一个受保护端点。
 *
 * 为什么要单独写这个：单个功能测试只会验证「管理员能改设置」，不会验证
 * 「普通用户不能改设置」。授权漏洞恰恰出在后者——某个端点忘了加 requireAdminSession，
 * 功能测试照样全绿。
 *
 * 两个容易写成假测试的坑，这里都显式处理：
 *   1. 来源校验在鉴权之前执行，跨站请求会先被 403 拦掉。如果不带合法 Origin，
 *      「普通用户被拒」会因为错误的原因通过。所以每个请求都带站内 Origin。
 *   2. 「来源非法」和「权限不足」都是 403 FORBIDDEN，只有 message 不同。
 *      因此断言必须核对具体文案，不能只看状态码。
 */
const database = createTestDatabase("kpblog-authz-test-");

let app: FastifyInstance;
let siteOrigin: string;
let adminToken: string;
let userToken: string;
let draftId: string;

type Role = "anonymous" | "user" | "admin";

const INSUFFICIENT_ROLE_MESSAGE = "需要管理员权限";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  label: string;
}

/** 全部由 requireAdminSession 守护的端点。 */
const ADMIN_ONLY: Endpoint[] = [
  { method: "POST", path: "/api/articles", body: { title: "x", content: "y" }, label: "新建文章" },
  { method: "PUT", path: "/api/articles/absent", body: { title: "x" }, label: "修改文章" },
  { method: "DELETE", path: "/api/articles/absent", label: "删除文章" },
  // 不带 postId 时 /api/comments 是管理端审核列表，与公开评论列表是同一路径的两种语义。
  { method: "GET", path: "/api/comments", label: "评论审核列表" },
  { method: "PUT", path: "/api/comments/absent", body: { approved: true }, label: "审核评论" },
  { method: "DELETE", path: "/api/comments/absent", label: "删除评论" },
  { method: "POST", path: "/api/music", body: {}, label: "新增音乐" },
  { method: "DELETE", path: "/api/music/absent", label: "删除音乐" },
  { method: "PUT", path: "/api/settings", body: { blog_title: "x" }, label: "修改站点设置" },
  { method: "PUT", path: "/api/profile", body: { name: "x" }, label: "修改个人资料" },
  { method: "POST", path: "/api/import", body: {}, label: "批量导入" },
  { method: "POST", path: "/api/categories", body: { name: "x" }, label: "新建分类" },
  { method: "PUT", path: "/api/categories/absent", body: { name: "x" }, label: "修改分类" },
  { method: "DELETE", path: "/api/categories/absent", label: "删除分类" },
  { method: "POST", path: "/api/tags", body: { name: "x" }, label: "新建标签" },
  { method: "PUT", path: "/api/tags/absent", body: { name: "x" }, label: "修改标签" },
  { method: "DELETE", path: "/api/tags/absent", label: "删除标签" },
  { method: "POST", path: "/api/tags/absent/merge", body: { targetId: "absent" }, label: "合并标签" },
  { method: "POST", path: "/api/images/adopt", label: "收编文章图片" },
  { method: "POST", path: "/api/collections", body: { name: "x" }, label: "新建项目" },
  { method: "PUT", path: "/api/collections/absent", body: { name: "x" }, label: "修改项目" },
  { method: "DELETE", path: "/api/collections/absent", label: "删除项目" },
];

async function call(
  role: Role,
  endpoint: { method: string; path: string; body?: Record<string, unknown> }
) {
  const headers: Record<string, string> = { origin: siteOrigin };
  if (role === "admin") headers.cookie = `session=${adminToken}`;
  if (role === "user") headers.cookie = `session=${userToken}`;
  if (endpoint.body !== undefined) headers["content-type"] = "application/json";

  const response = await app.inject({
    method: endpoint.method as "GET",
    url: endpoint.path,
    headers,
    payload: endpoint.body,
  });
  const raw = response.body;
  let json: {
    success: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
  } = { success: false };
  try {
    json = raw ? JSON.parse(raw) : json;
  } catch {
    /* 非 JSON 响应保持默认值 */
  }
  return { status: response.statusCode, json };
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.TRUST_PROXY = "false";
  delete process.env.TRUST_PROXY_HEADER;

  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  const { hashPassword } = await import("../src/lib/auth");
  const { getJwtSecret } = await import("../src/lib/env");
  const { SignJWT } = await import("jose");

  app = buildApp();
  await app.ready();
  siteOrigin = process.env.SITE_URL ?? "http://localhost:3000";

  const admin = await prisma.user.create({
    data: {
      username: "authz-admin",
      password: await hashPassword("admin-password-12345"),
      role: "ADMIN",
    },
  });
  const user = await prisma.user.create({
    data: {
      username: "authz-user",
      password: await hashPassword("user-password-12345"),
      role: "USER",
    },
  });

  // 直接签发令牌，避免为每个用例都走一次登录（登录本身有限流）。
  const mint = (userId: string, role: string, tokenVersion: number) =>
    new SignJWT({ userId, username: role.toLowerCase(), role, tokenVersion })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(getJwtSecret()));

  adminToken = await mint(admin.id, "ADMIN", admin.tokenVersion);
  userToken = await mint(user.id, "USER", user.tokenVersion);

  const draft = await prisma.post.create({
    data: { slug: "authz-draft", title: "未发布草稿", content: "x", published: false },
  });
  draftId = draft.id;
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

test("anonymous callers get 401 UNAUTHORIZED on every admin endpoint", async () => {
  for (const endpoint of ADMIN_ONLY) {
    const { status, json } = await call("anonymous", endpoint);
    assert.equal(
      status,
      401,
      `${endpoint.label}（${endpoint.method} ${endpoint.path}）对匿名请求应返回 401，实际 ${status}`
    );
    assert.equal(json.error?.code, "UNAUTHORIZED", endpoint.label);
  }
});

test("signed-in non-admins get 403 for insufficient role, not for a bad origin", async () => {
  for (const endpoint of ADMIN_ONLY) {
    const { status, json } = await call("user", endpoint);
    assert.equal(
      status,
      403,
      `${endpoint.label}（${endpoint.method} ${endpoint.path}）对普通用户应返回 403，实际 ${status}`
    );
    // 关键：403「来源非法」和 403「权限不足」状态码相同，只看状态码会掩盖
    // 「其实是被来源校验拦下」这种情况，那样这条断言就完全没在测授权。
    assert.equal(json.error?.code, "FORBIDDEN", endpoint.label);
    assert.equal(
      json.error?.message,
      INSUFFICIENT_ROLE_MESSAGE,
      `${endpoint.label} 必须是因权限不足被拒（而不是来源校验），实际提示：${json.error?.message}`
    );
  }
});

test("administrators pass the authorization gate on every admin endpoint", async () => {
  for (const endpoint of ADMIN_ONLY) {
    const { status, json } = await call("admin", endpoint);
    // 管理员可能因为资源不存在拿到 404、因为请求体不合法拿到 400——
    // 这些都说明已经越过了鉴权关口。真正要排除的是 401/403。
    assert.notEqual(
      status,
      401,
      `${endpoint.label}：管理员不应被判为未登录`
    );
    assert.notEqual(
      status,
      403,
      `${endpoint.label}：管理员不应被判为权限不足（${json.error?.message ?? ""}）`
    );
  }
});

test("draft articles are visible to administrators only", async () => {
  const anonymous = await call("anonymous", { method: "GET", path: `/api/articles/${draftId}` });
  assert.equal(anonymous.status, 404, "未发布文章对匿名访客必须表现为不存在");

  const normal = await call("user", { method: "GET", path: `/api/articles/${draftId}` });
  assert.equal(normal.status, 404, "普通登录用户同样不应看到草稿");

  const admin = await call("admin", { method: "GET", path: `/api/articles/${draftId}` });
  assert.equal(admin.status, 200, "管理员需要能读取草稿以完成编辑与预览");
});

test("changing your own password needs a session but not the admin role", async () => {
  const endpoint = {
    method: "PUT",
    path: "/api/auth/password",
    body: { currentPassword: "x", newPassword: "y" },
  };

  const anonymous = await call("anonymous", endpoint);
  assert.equal(anonymous.status, 401, "匿名不能改密码");

  // 普通用户改自己的密码是合法操作：这里用 requireAuthSession 而不是 requireAdminSession。
  const normal = await call("user", endpoint);
  assert.notEqual(normal.status, 401, "普通用户应已通过登录校验");
  assert.notEqual(normal.status, 403, "普通用户不应被判为权限不足");
});

test("the publishing API key is an admin credential rather than a per-user one", async () => {
  const endpoint = { method: "GET", path: "/api/auth/key" };

  const anonymous = await call("anonymous", endpoint);
  assert.equal(anonymous.status, 401, "匿名不能读取发布密钥");

  // 这一条是刻意的设计：发布密钥能直接改线上内容，属于管理员能力。
  // getCurrentUserApiKey 用的是 requireAdminSession，普通用户必须被拒。
  const normal = await call("user", endpoint);
  assert.equal(normal.status, 403, "普通用户不应能读取发布密钥");
  assert.equal(normal.json.error?.message, INSUFFICIENT_ROLE_MESSAGE);

  const admin = await call("admin", endpoint);
  assert.equal(admin.status, 200);
  // 响应只报告「是否已设置」，绝不回显密钥本身。
  assert.equal(admin.json.data?.apiKey, null);
});

test("the publish endpoint is guarded by an API key rather than a session", async () => {
  const anonymous = await call("anonymous", {
    method: "POST",
    path: "/api/publish",
    body: { title: "x", content: "y" },
  });
  assert.equal(anonymous.status, 401, "无 API Key 的发布请求必须被拒绝");

  // 管理员的会话令牌不能替代 API Key —— 这是两条独立的凭据通路。
  const admin = await call("admin", {
    method: "POST",
    path: "/api/publish",
    body: { title: "x", content: "y" },
  });
  assert.equal(admin.status, 401, "管理员会话不应能绕过发布 API Key");
});
