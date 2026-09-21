import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { createTestDatabase } from "./helpers/test-db";

/**
 * 分类/标签后台管理的服务与路由行为。
 *
 * 管理端点在授权矩阵（authorization.test.ts）里已覆盖「谁能调用」；这里覆盖
 * 「调用了会发生什么」——特别是删除/合并对文章的副作用，这些是界面上
 * 最容易被误解、也最难靠肉眼验证的部分。
 */
const database = createTestDatabase("kpblog-taxonomy-admin-");

let app: FastifyInstance;
let siteOrigin: string;
let adminCookie: string;

interface TaxonomyDto {
  id: string;
  name: string;
  slug: string;
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

async function expectOk(pending: ReturnType<typeof callAdmin>) {
  const { status, json } = await pending;
  assert.equal(status, 200, json.error?.message);
  assert.equal(json.success, true);
  return json.data;
}

async function createCategory(name: string): Promise<TaxonomyDto> {
  const { status, json } = await callAdmin("POST", "/api/categories", { name });
  assert.equal(status, 201, json.error?.message);
  return json.data;
}

async function createTag(name: string): Promise<TaxonomyDto> {
  const { status, json } = await callAdmin("POST", "/api/tags", { name });
  assert.equal(status, 201, json.error?.message);
  return json.data;
}

async function createPost(slug: string, tagIds: string[], categoryId?: string) {
  const { prisma } = await import("../src/lib/prisma");
  return prisma.post.create({
    data: {
      slug,
      title: slug,
      content: "x",
      published: true,
      categoryId,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
  });
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
      username: "taxonomy-admin",
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

test("create category: name slugified, empty name rejected", async () => {
  const created = await createCategory("前端技术");
  assert.equal(created.name, "前端技术");
  assert.match(created.slug, /^[a-z0-9-]+$/, "中文分类应得到拼音 slug");
  assert.equal(created.postCount, 0);

  const { status, json } = await callAdmin("POST", "/api/categories", { name: "  " });
  assert.equal(status, 400);
  assert.equal(json.error?.code, "BAD_REQUEST");
});

test("create category: duplicate name and duplicate slug both rejected with 400", async () => {
  await createCategory("读书笔记");

  const byName = await callAdmin("POST", "/api/categories", { name: "读书笔记" });
  assert.equal(byName.status, 400);
  assert.match(byName.json.error?.message ?? "", /同名/);

  // 不同名字、相同 slug（slugify 归一后）同样冲突。
  const bySlug = await callAdmin("POST", "/api/categories", { name: "读书 笔记" });
  assert.equal(bySlug.status, 400);
  assert.match(bySlug.json.error?.message ?? "", /slug/);
});

test("update category: rename keeps slug by default; explicit slug changes it", async () => {
  const category = await createCategory("旧分类");

  const renamed = (await expectOk(
    callAdmin("PUT", `/api/categories/${category.id}`, { name: "新分类" })
  )) as TaxonomyDto;
  assert.equal(renamed.name, "新分类");
  assert.equal(renamed.slug, category.slug, "重命名不应悄悄改变公开 URL");

  const reslugged = (await expectOk(
    callAdmin("PUT", `/api/categories/${category.id}`, { slug: "brand-new" })
  )) as TaxonomyDto;
  assert.equal(reslugged.slug, "brand-new");

  const noChange = await callAdmin("PUT", `/api/categories/${category.id}`, {
    name: "新分类",
    slug: "brand-new",
  });
  assert.equal(noChange.status, 200, "与现状一致的更新应幂等成功");

  const missing = await callAdmin("PUT", "/api/categories/absent", { name: "x" });
  assert.equal(missing.status, 404);
});

test("delete category: posts keep content, categoryId becomes null", async () => {
  const category = await createCategory("将删分类");
  const post = await createPost("taxonomy-del-cat", [], category.id);

  const result = (await expectOk(callAdmin("DELETE", `/api/categories/${category.id}`))) as {
    deleted: boolean;
  };
  assert.equal(result.deleted, true);

  const { prisma } = await import("../src/lib/prisma");
  const surviving = await prisma.post.findUnique({ where: { id: post.id } });
  assert.ok(surviving, "删除分类不得删除文章");
  assert.equal(surviving?.categoryId, null, "文章的分类引用应被置空");

  const gone = await callAdmin("DELETE", `/api/categories/${category.id}`);
  assert.equal(gone.status, 404);
});

test("admin tag list: includes unused tags and counts drafts", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const unused = await createTag("无人使用");
  await prisma.post.create({
    data: {
      slug: "taxonomy-draft-tagged",
      title: "草稿",
      content: "x",
      published: false,
      tags: { create: [{ tagId: unused.id }] },
    },
  });

  const { status, json } = await callAdmin("GET", "/api/tags?all=true");
  assert.equal(status, 200);
  const tags = json.data as TaxonomyDto[];
  const found = tags.find((tag) => tag.id === unused.id);
  assert.ok(found, "管理端列表必须包含没有已发布文章的标签");
  assert.equal(found?.postCount, 1, "管理端计数应包含草稿");
});

test("public tag list stays filtered: unused tags hidden", async () => {
  const { status, json } = await callAdmin("GET", "/api/tags");
  const tags = json.data as TaxonomyDto[];
  assert.equal(status, 200);
  assert.ok(
    !tags.some((tag) => tag.name === "无人使用"),
    "不带 all=true 时公开过滤语义必须保持"
  );
});

test("update tag: rename to an existing name fails with merge hint", async () => {
  await createTag("已有标签");
  const other = await createTag("待改标签");

  const { status, json } = await callAdmin("PUT", `/api/tags/${other.id}`, { name: "已有标签" });
  assert.equal(status, 400);
  assert.match(json.error?.message ?? "", /合并/);
});

test("merge tag: post links move, overlaps deduplicated, source deleted", async () => {
  const source = await createTag("合并源");
  const target = await createTag("合并目标");

  const { prisma } = await import("../src/lib/prisma");
  // postA 同时挂两个标签（重叠），postB 只挂 source（应迁移）。
  await createPost("taxonomy-merge-a", [source.id, target.id]);
  await createPost("taxonomy-merge-b", [source.id]);

  const merged = (await expectOk(
    callAdmin("POST", `/api/tags/${source.id}/merge`, { targetId: target.id })
  )) as TaxonomyDto;
  assert.equal(merged.id, target.id);
  assert.equal(merged.postCount, 2, "目标标签应吸收全部两篇文章");

  assert.equal(await prisma.tag.findUnique({ where: { id: source.id } }), null, "源标签应被删除");
  const postALinks = await prisma.tagOnPost.count({
    where: { tag: { name: "合并目标" }, post: { slug: "taxonomy-merge-a" } },
  });
  assert.equal(postALinks, 1, "重叠文章不得出现重复关联");

  const selfMerge = await callAdmin("POST", `/api/tags/${target.id}/merge`, {
    targetId: target.id,
  });
  assert.equal(selfMerge.status, 400, "不能合并到自身");
});

test("delete tag: post links removed, post itself survives", async () => {
  const tag = await createTag("将删标签");
  const post = await createPost("taxonomy-del-tag", [tag.id]);

  await expectOk(callAdmin("DELETE", `/api/tags/${tag.id}`));

  const { prisma } = await import("../src/lib/prisma");
  const surviving = await prisma.post.findUnique({
    where: { id: post.id },
    include: { tags: true },
  });
  assert.ok(surviving, "删除标签不得删除文章");
  assert.equal(surviving?.tags.length, 0, "文章上的标签关联应被移除");
});
