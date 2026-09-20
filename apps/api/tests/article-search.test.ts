import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";

/**
 * 公开文章索引(`/api/public/article-index`)的关键词搜索。
 *
 * 背景:列表页此前只有分页没有搜索;搜索能力一直在 listArticles 里
 * (首页下拉在用),这里把「公开索引数据面支持 q」钉住——只命中已发布文章,
 * 覆盖标题/摘要/正文,total 与分页随过滤联动。
 */
let app: FastifyInstance;

before(async () => {
  const { createTestDatabase } = await import("./helpers/test-db");
  const database = createTestDatabase("kpblog-article-search-");
  process.env.DATABASE_URL = `file:${database.databasePath}`;
  process.env.JWT_SECRET = "test-secret-for-article-search-000";
  process.env.SITE_URL = "http://localhost:3000";
  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();

  const { prisma } = await import("../src/lib/prisma");
  const base = { published: true, publishedAt: new Date("2026-01-01T00:00:00.000Z") };
  await prisma.post.createMany({
    data: [
      { ...base, slug: "generic-title", title: "TypeScript 泛型入门", content: "正文讲约束。", excerpt: "泛型基础。" },
      { ...base, slug: "generic-excerpt", title: "数据库索引", content: "正文讲 B+ 树。", excerpt: "聊聊泛型的边界。" },
      { ...base, slug: "generic-body", title: "旅行日志", content: "路上重新读了泛型的文档。", excerpt: null },
      { ...base, slug: "unrelated", title: "面包配方", content: "面粉与水。", excerpt: null },
      { slug: "draft-match", title: "泛型草稿", content: "未发布的泛型笔记。", excerpt: null, published: false },
    ],
  });
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
});

const fetchIndex = async (query: string) => {
  const response = await app.inject({ method: "GET", url: `/api/public/article-index?q=${encodeURIComponent(query)}` });
  return response.json().data;
};

test("q filters published articles by title, excerpt and content", async () => {
  const { items, total } = await fetchIndex("泛型");
  assert.equal(total, 3);
  const slugs = items.map((item: { slug: string }) => item.slug).sort();
  assert.deepEqual(slugs, ["generic-body", "generic-excerpt", "generic-title"]);
});

test("unrelated queries return an empty page and drafts never match", async () => {
  const { total } = await fetchIndex("面包");
  assert.equal(total, 1); // 只命中已发布的「面包配方」
  const draft = await fetchIndex("泛型草稿");
  assert.equal(draft.total, 0); // 草稿不参与公开搜索
});

test("empty q behaves like the unfiltered index", async () => {
  const { total } = await fetchIndex("");
  const all = await app.inject({ method: "GET", url: "/api/public/article-index" });
  const allData = all.json().data;
  assert.equal(total, allData.total);
  assert.equal(total, 4); // 4 篇已发布(不含草稿)
});
