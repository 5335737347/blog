import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { createTestDatabase } from "./helpers/test-db";

/**
 * 项目合集的后台管理行为。授权（谁能调用）在 authorization.test.ts；
 * 这里覆盖 CRUD、slug 规则与删除对文章的副作用。
 */
const database = createTestDatabase("kpblog-project-test-");

let app: FastifyInstance;
let siteOrigin: string;
let adminCookie: string;

interface ProjectDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverImage: string | null;
  postCount: number;
}

async function callAdmin(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>
) {
  const headers: Record<string, string> = { origin: siteOrigin, cookie: adminCookie };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await app.inject({ method, url: path, headers, payload: body });
  return { status: response.statusCode, json: JSON.parse(response.body) };
}

async function createProject(name: string, extra: Record<string, unknown> = {}): Promise<ProjectDto> {
  const { status, json } = await callAdmin("POST", "/api/collections", { name, ...extra });
  assert.equal(status, 201, json.error?.message);
  return json.data;
}

before(async () => {
  process.env.NODE_ENV = "test";
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
      username: "project-admin",
      password: await hashPassword("admin-password-12345"),
      role: "ADMIN",
    },
  });
  const token = await new SignJWT({
    userId: admin.id,
    username: admin.username,
    role: "ADMIN",
    tokenVersion: admin.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(getJwtSecret()));
  adminCookie = `session=${token}`;
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

test("create project: slugified, description/cover stored, duplicate rejected", async () => {
  const project = await createProject("博客引擎重构", {
    description: "把后台管理一步步补齐的记录",
    coverImage: "/images/cover.png",
  });
  assert.match(project.slug, /^[a-z0-9-]+$/);
  assert.equal(project.description, "把后台管理一步步补齐的记录");
  assert.equal(project.coverImage, "/images/cover.png");
  assert.equal(project.postCount, 0);

  const dup = await callAdmin("POST", "/api/collections", { name: "博客引擎重构" });
  assert.equal(dup.status, 400);
  assert.match(dup.json.error?.message ?? "", /同名/);
});

test("article can join a project via projectId and leaves it on delete", async () => {
  const project = await createProject("有文章的项目");

  const created = await callAdmin("POST", "/api/articles", {
    title: "项目内文章",
    content: "正文",
    published: true,
    projectId: project.id,
  });
  assert.equal(created.status, 201, created.json.error?.message);
  const articleId = created.json.data.id as string;

  // 管理端计数（all=true 含草稿）应包含这篇文章
  const list = await callAdmin("GET", "/api/collections?all=true");
  const found = (list.json.data as ProjectDto[]).find((item) => item.id === project.id);
  assert.equal(found?.postCount, 1);

  // 无效 projectId 400
  const bad = await callAdmin("POST", "/api/articles", {
    title: "坏引用",
    content: "正文",
    projectId: "absent",
  });
  assert.equal(bad.status, 400);

  // 删除项目 → 文章保留、projectId 置空
  const deleted = await callAdmin("DELETE", `/api/collections/${project.id}`);
  assert.equal(deleted.status, 200);

  const { prisma } = await import("../src/lib/prisma");
  const post = await prisma.post.findUnique({ where: { id: articleId } });
  assert.ok(post, "删除项目不得删除文章");
  assert.equal(post?.projectId, null);
});

test("update project: rename keeps slug; explicit slug changes it; clear cover", async () => {
  const project = await createProject("旧项目名", { coverImage: "/images/x.png" });

  const renamed = await callAdmin("PUT", `/api/collections/${project.id}`, { name: "新项目名" });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.data.slug, project.slug, "重命名不应改变公开 URL");

  const reslugged = await callAdmin("PUT", `/api/collections/${project.id}`, { slug: "brand-new-project" });
  assert.equal(reslugged.json.data.slug, "brand-new-project");

  const cleared = await callAdmin("PUT", `/api/collections/${project.id}`, { coverImage: null });
  assert.equal(cleared.json.data.coverImage, null);

  const noChange = await callAdmin("PUT", `/api/collections/${project.id}`, {});
  assert.equal(noChange.status, 400, "空更新应拒绝");

  const missing = await callAdmin("PUT", "/api/collections/absent", { name: "x" });
  assert.equal(missing.status, 404);
});

test("public list keeps published-only counts; admin list counts drafts", async () => {
  const project = await createProject("计数口径项目");
  const { prisma } = await import("../src/lib/prisma");
  await prisma.post.create({
    data: {
      slug: "project-draft-post",
      title: "草稿",
      content: "x",
      published: false,
      projectId: project.id,
    },
  });
  await prisma.post.create({
    data: {
      slug: "project-published-post",
      title: "已发布",
      content: "x",
      published: true,
      projectId: project.id,
    },
  });

  const publicList = await app.inject({ method: "GET", url: "/api/collections" });
  const publicView = (JSON.parse(publicList.body).data as ProjectDto[]).find(
    (item) => item.id === project.id
  );
  assert.ok(publicView, "公开列表保留项目占位");
  assert.equal(publicView?.postCount, 1, "公开口径只计已发布");

  const adminList = await callAdmin("GET", "/api/collections?all=true");
  const adminView = (adminList.json.data as ProjectDto[]).find((item) => item.id === project.id);
  assert.equal(adminView?.postCount, 2, "管理口径含草稿");
});
