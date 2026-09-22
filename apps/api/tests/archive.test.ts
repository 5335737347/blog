import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-archive-test-");

let prisma: typeof import("../src/lib/prisma").prisma;
let getArchiveData: typeof import("../src/server/public/public-service").getArchiveData;

before(async () => {
  ({ prisma } = await import("../src/lib/prisma"));
  ({ getArchiveData } = await import("../src/server/public/public-service"));
});

after(async () => {
  await prisma.$disconnect();
  database.cleanup();
});

async function seed(slug: string, publishedAt: Date | null, published = true) {
  return prisma.post.create({
    data: {
      slug,
      title: `标题 ${slug}`,
      content: "正文",
      published,
      publishedAt,
    },
  });
}

test("archive is empty before anything is published", async () => {
  assert.deepEqual(await getArchiveData(), { total: 0, projects: [], years: [] });
});

test("archive groups published posts by year, newest year first", async () => {
  await seed("a-2024", new Date("2024-03-01T00:00:00Z"));
  await seed("a-2026", new Date("2026-01-15T00:00:00Z"));
  await seed("b-2026", new Date("2026-08-20T00:00:00Z"));
  await seed("c-2025", new Date("2025-12-31T00:00:00Z"));

  const archive = await getArchiveData();

  assert.equal(archive.total, 4);
  assert.deepEqual(
    archive.years.map((group) => group.year),
    [2026, 2025, 2024],
    "年份应新→旧"
  );

  const y2026 = archive.years.find((group) => group.year === 2026);
  assert.deepEqual(
    y2026?.posts.map((post) => post.slug),
    ["b-2026", "a-2026"],
    "同一年内也应新→旧"
  );

  assert.deepEqual(archive.years.find((g) => g.year === 2025)?.posts.map((p) => p.slug), ["c-2025"]);
  assert.deepEqual(archive.years.find((g) => g.year === 2024)?.posts.map((p) => p.slug), ["a-2024"]);

  // 每条都要带可用的 publishedAt
  assert.equal(y2026?.posts[0].publishedAt, new Date("2026-08-20T00:00:00Z").toISOString());
});

test("archive excludes drafts", async () => {
  await seed("draft-only", new Date("2027-01-01T00:00:00Z"), false);

  const archive = await getArchiveData();
  const allSlugs = archive.years.flatMap((group) => group.posts.map((post) => post.slug));
  assert.ok(!allSlugs.includes("draft-only"), "草稿不应出现在归档里");
  assert.equal(archive.total, 4, "总数不应因草稿变化");
});

test("archive keeps posts without a publish date in a trailing bucket", async () => {
  await seed("undated", null);

  const archive = await getArchiveData();
  const last = archive.years.at(-1);

  assert.equal(last?.year, null, "无日期的文章应排在最后");
  assert.deepEqual(last?.posts.map((post) => post.slug), ["undated"]);
  assert.equal(last?.posts[0].publishedAt, null);
  assert.equal(archive.total, 5);
});

test("admins can backdate a post so it files under the right year", async () => {
  const { createArticle, updateArticle } = await import(
    "../src/server/articles/article-service"
  );

  // 创建时直接指定日期
  const backdated = await createArticle({
    title: "回填的旧文章",
    slug: "backdated-post",
    content: "正文",
    published: true,
    publishedAt: "2019-04-02T10:00:00.000Z",
  });
  assert.equal(
    backdated.publishedAt,
    new Date("2019-04-02T10:00:00.000Z").toISOString(),
    "createArticle 应接受自定义发布日期"
  );

  const archive = await getArchiveData();
  const y2019 = archive.years.find((group) => group.year === 2019);
  assert.deepEqual(y2019?.posts.map((post) => post.slug), ["backdated-post"]);
  // 有日期的年份新→旧；无日期的桶恒定排在最后
  const dated = archive.years.filter((g) => g.year !== null).map((g) => g.year as number);
  assert.deepEqual(dated, [...dated].sort((a, b) => b - a));
  assert.ok(dated.includes(2019));
  assert.equal(archive.years.at(-1)?.year, null, "无日期的桶应始终在最后");

  // 编辑时也能改日期
  const moved = await updateArticle(backdated.id, {
    publishedAt: "2021-06-06T00:00:00.000Z",
  });
  assert.equal(moved.publishedAt, new Date("2021-06-06T00:00:00.000Z").toISOString());

  // 非法日期应被拒绝，而不是静默写入 Invalid Date
  await assert.rejects(
    () => updateArticle(backdated.id, { publishedAt: "not-a-date" }),
    { status: 400 }
  );

  // 未提供日期时保持原值
  const untouched = await updateArticle(backdated.id, { title: "只改标题" });
  assert.equal(
    untouched.publishedAt,
    new Date("2021-06-06T00:00:00.000Z").toISOString(),
    "未提供 publishedAt 时不应改动日期"
  );

  // 转回草稿会清空日期
  const backToDraft = await updateArticle(backdated.id, { published: false });
  assert.equal(backToDraft.publishedAt, null);
});
