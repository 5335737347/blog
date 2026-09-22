import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";

/**
 * 项目合集的公开数据面：/api/public/collections/:slug 与归档的项目分组。
 *
 * 归档页从「按年份」改为「按项目分区 + 未归入项目按年份兜底」，这里钉住
 * 服务端的分组与排序行为：项目内新→旧、项目之间按最新文章倒序、未归入
 * 项目的年份兜底排在整个列表之后。
 */
let app: FastifyInstance;

before(async () => {
  const { createTestDatabase } = await import("./helpers/test-db");
  const database = createTestDatabase("kpblog-collections-public-");
  process.env.DATABASE_URL = `file:${database.databasePath}`;
  process.env.JWT_SECRET = "test-secret-for-collections-0000";
  process.env.SITE_URL = "http://localhost:3000";
  const { buildApp } = await import("../src/app");
  app = buildApp();
  await app.ready();

  const { prisma } = await import("../src/lib/prisma");
  const engine = await prisma.project.create({
    data: { name: "引擎重构", slug: "engine", description: "把地基换一遍" },
  });
  const travel = await prisma.project.create({
    data: { name: "旅行计划", slug: "travel", description: "" },
  });

  const post = (
    slug: string,
    publishedAt: Date,
    projectId?: string,
    published = true
  ) =>
    prisma.post.create({
      data: {
        slug,
        title: slug,
        content: "x",
        published,
        publishedAt: published ? publishedAt : null,
        projectId,
      },
    });

  // 引擎项目：两篇（含一篇 2024 的旧文）；项目最新一篇是 2026-03。
  await post("engine-new", new Date("2026-03-01T00:00:00.000Z"), engine.id);
  await post("engine-old", new Date("2024-06-01T00:00:00.000Z"), engine.id);
  // 旅行项目：最新一篇 2026-08 → 项目排序应在引擎之前。
  await post("travel-post", new Date("2026-08-01T00:00:00.000Z"), travel.id);
  // 未归入项目：2025 与 2026-01 各一篇，外加一篇草稿（不参与）。
  await post("loose-2025", new Date("2025-05-01T00:00:00.000Z"));
  await post("loose-2026", new Date("2026-01-15T00:00:00.000Z"));
  await post("draft-post", new Date("2026-09-01T00:00:00.000Z"), engine.id, false);
});

after(async () => {
  await app.close();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
});

interface ArchiveResponse {
  total: number;
  projects: {
    project: { slug: string; description: string };
    posts: { slug: string; publishedAt: string | null }[];
  }[];
  years: { year: number | null; posts: { slug: string }[] }[];
}

test("archive groups by project then falls back to years for ungrouped posts", async () => {
  const response = await app.inject({ method: "GET", url: "/api/public/archive" });
  assert.equal(response.statusCode, 200);
  const data = response.json().data as ArchiveResponse;

  // 草稿不计入总数（5 篇已发布）。
  assert.equal(data.total, 5);

  // 项目之间按最新文章倒序：travel（2026-08）在 engine（2026-03）之前。
  assert.deepEqual(
    data.projects.map((entry) => entry.project.slug),
    ["travel", "engine"]
  );

  const engine = data.projects[1];
  assert.equal(engine.project.description, "把地基换一遍");
  assert.deepEqual(
    engine.posts.map((post) => post.slug),
    ["engine-new", "engine-old"],
    "项目内按时间倒序，草稿不出现"
  );

  // 未归入项目的年份兜底：2026 在 2025 之前，年份内新→旧。
  assert.deepEqual(
    data.years.map((group) => group.year),
    [2026, 2025]
  );
  assert.deepEqual(
    data.years[0].posts.map((post) => post.slug),
    ["loose-2026"]
  );
});

test("collection page returns project meta with paginated published posts", async () => {
  const response = await app.inject({ method: "GET", url: "/api/public/collections/engine?page=1&limit=1" });
  assert.equal(response.statusCode, 200);
  const data = response.json().data as {
    project: { slug: string } | null;
    articles: { items: { slug: string }[]; total: number; totalPages: number };
  };

  assert.equal(data.project?.slug, "engine");
  assert.equal(data.articles.total, 2);
  assert.equal(data.articles.totalPages, 2);
  assert.deepEqual(data.articles.items.map((item) => item.slug), ["engine-new"]);

  const page2 = await app.inject({ method: "GET", url: "/api/public/collections/engine?page=2&limit=1" });
  assert.deepEqual(
    (page2.json().data.articles.items as { slug: string }[]).map((item) => item.slug),
    ["engine-old"]
  );
});

test("unknown project slug yields null project", async () => {
  const response = await app.inject({ method: "GET", url: "/api/public/collections/absent" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.project, null);
});
