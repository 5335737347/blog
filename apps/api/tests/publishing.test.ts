import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-publishing-test-");

let publishMarkdown: typeof import("../src/server/publishing/publishing-service").publishMarkdown;
let importFiles: typeof import("../src/server/publishing/publishing-service").importFiles;

before(async () => {
  ({ publishMarkdown, importFiles } = await import(
    "../src/server/publishing/publishing-service"
  ));
});

after(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

test("colliding tag names do not violate the post/tag primary key", async () => {
  // "Next.js"、"NextJS"、"nextjs" 归一后是同一个 slug，会解析出同一个 tagId。
  // 若按名字去重而不按 slug 去重，同一 (postId, tagId) 会被写入两次。
  const result = await publishMarkdown({
    title: "标签归一化测试",
    content: "正文内容",
    tags: ["Next.js", "NextJS", "nextjs"],
  });

  const { prisma } = await import("../src/lib/prisma");
  const post = await prisma.post.findUnique({
    where: { id: result.post.id },
    include: { tags: { include: { tag: true } } },
  });

  assert.equal(post?.tags.length, 1, "归一后相同的标签只应关联一次");
  assert.equal(post?.tags[0].tag.slug, "nextjs");
});

test("c++ and c collapse without crashing", async () => {
  const result = await publishMarkdown({
    title: "C 系列标签",
    content: "正文",
    tags: ["C++", "C"],
  });

  const { prisma } = await import("../src/lib/prisma");
  const post = await prisma.post.findUnique({
    where: { id: result.post.id },
    include: { tags: true },
  });
  assert.equal(post?.tags.length, 1);
});

test("duplicate slug reports a conflict instead of a server error", async () => {
  await publishMarkdown({ title: "重复 slug", content: "第一次", slug: "dup-slug" });

  await assert.rejects(
    () => publishMarkdown({ title: "重复 slug", content: "第二次", slug: "dup-slug" }),
    (error: { status?: number; code?: string }) => {
      assert.equal(error.status, 409, "应为 409 冲突而不是 500");
      assert.equal(error.code, "CONFLICT");
      return true;
    }
  );
});

test("publishMarkdown rejects empty content and applies frontmatter", async () => {
  await assert.rejects(() => publishMarkdown({ content: "   " }), { status: 400 });
  await assert.rejects(() => publishMarkdown({}), { status: 400 });

  const result = await publishMarkdown({
    content: [
      "---",
      "title: 来自 frontmatter 的标题",
      "tags: [Alpha, Beta]",
      "category: 测试分类",
      "published: true",
      "date: 2030-05-05",
      "---",
      "",
      "# 正文标题",
      "",
      "正文里还有一个 #inline 标签。",
    ].join("\n"),
  });

  const { prisma } = await import("../src/lib/prisma");
  const post = await prisma.post.findUnique({
    where: { id: result.post.id },
    include: { tags: { include: { tag: true } }, category: true },
  });

  assert.equal(post?.title, "来自 frontmatter 的标题");
  assert.equal(post?.published, true);
  assert.equal(post?.publishedAt?.toISOString().slice(0, 10), "2030-05-05");
  assert.equal(post?.category?.name, "测试分类");
  const slugs = post?.tags.map((item) => item.tag.slug).sort();
  assert.deepEqual(slugs, ["alpha", "beta", "inline"]);
  // 自动摘要不应包含 frontmatter
  assert.ok(post?.excerpt && !post.excerpt.includes("---"));
});

test("publishMarkdown reuses an existing category whose name and slug do not correspond", async () => {
  // 回归：分类先由后台按中文名建立（name=技术, slug=tech），
  // 此时按 frontmatter 的 category: 技术 发布，曾因 upsert 写重复 name 而 500。
  const { prisma } = await import("../src/lib/prisma");
  await prisma.category.create({ data: { name: "已有分类", slug: "existing-slug" } });

  const result = await publishMarkdown({
    content: ["---", "title: 复用已有分类", "category: 已有分类", "published: true", "---", "", "正文"].join("\n"),
  });

  const post = await prisma.post.findUnique({
    where: { id: result.post.id },
    include: { category: true },
  });
  assert.equal(post?.category?.slug, "existing-slug");

  const categories = await prisma.category.findMany({ where: { name: "已有分类" } });
  assert.equal(categories.length, 1);
});

test("importFiles reports per-file outcome and rejects unsupported types", async () => {
  const good = new File([new Uint8Array(Buffer.from("# 导入标题\n\n导入正文"))], "ok.md", {
    type: "text/markdown",
  });
  const bad = new File([new Uint8Array(Buffer.from("binary"))], "photo.png", {
    type: "image/png",
  });
  const empty = new File([new Uint8Array(Buffer.from("   "))], "empty.md", {
    type: "text/markdown",
  });

  const result = await importFiles([good, bad, empty]);

  assert.equal(result.results.length, 3);
  assert.equal(result.imported, 1);
  assert.equal(result.failed, 2);
  assert.equal(result.results[0].success, true);
  assert.equal(result.results[0].source, "md");
  assert.equal(result.results[1].success, false);
  assert.match(result.results[1].error ?? "", /不支持的文件类型/);
  assert.equal(result.results[2].success, false);

  // 导入的文件默认是草稿
  const { prisma } = await import("../src/lib/prisma");
  const post = await prisma.post.findUnique({ where: { id: result.results[0].id } });
  assert.equal(post?.published, false);
  assert.equal(post?.publishedAt, null);
});

test("importFiles does not leak internal error details on unexpected failures", async () => {
  // 超大文件在 fileToMarkdown 里被拒绝，错误信息应是可控的中文提示。
  const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.md", {
    type: "text/markdown",
  });
  const result = await importFiles([huge]);
  assert.equal(result.failed, 1);
  assert.match(result.results[0].error ?? "", /10MB/);
});
