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

test("republishing the same slug updates the post (Obsidian edit-and-republish)", async () => {
  const first = await publishMarkdown({
    title: "重复 slug",
    content: "第一次",
    slug: "dup-slug",
  });
  assert.equal(first.updated, false);

  const second = await publishMarkdown({
    title: "重复 slug（已更新）",
    content: "第二次的正文内容",
    slug: "dup-slug",
  });
  assert.equal(second.updated, true, "同 slug 再次发布应走覆盖更新");
  assert.equal(second.post.id, first.post.id, "更新不得改变文章 id");
  assert.equal(second.post.slug, "dup-slug", "更新不得改变 slug");

  const { prisma } = await import("../src/lib/prisma");
  const post = await prisma.post.findUnique({ where: { slug: "dup-slug" } });
  assert.equal(post?.content, "第二次的正文内容");
  assert.equal(post?.title, "重复 slug（已更新）");
  assert.match(post?.excerpt ?? "", /第二次/, "内容变了摘要应跟随更新");
});

test("import still refuses duplicate slugs (protects published content)", async () => {
  const note = (name: string, content: string) =>
    new File([content], name, { type: "text/markdown" });

  const first = await importFiles([note("import-dup.md", "# 导入重复\n\n第一篇正文")]);
  assert.equal(first.imported, 1);

  const second = await importFiles([note("import-dup.md", "# 导入重复\n\n第二篇正文")]);
  assert.equal(second.imported, 0);
  assert.equal(second.results[0]?.success, false);
  assert.match(second.results[0]?.error ?? "", /已存在/);
});

test("publish assigns a random built-in cover when the note has none", async () => {
  const result = await publishMarkdown({ title: "随机封面文章", content: "正文" });
  const { prisma } = await import("../src/lib/prisma");
  const post = await prisma.post.findUnique({ where: { id: result.post.id } });
  assert.match(
    post?.coverImage ?? "",
    /^\/images\/home\/wallpaper-0[1-8]\.webp$/,
    "未提供封面时应从内置封面池随机初始化"
  );

  const explicit = await publishMarkdown({
    title: "显式封面文章",
    content: "正文",
    coverImage: "https://cdn.example.com/my-cover.webp",
  });
  const explicitPost = await prisma.post.findUnique({ where: { id: explicit.post.id } });
  assert.equal(explicitPost?.coverImage, "https://cdn.example.com/my-cover.webp");

  // 覆盖更新时笔记没写封面 → 保留文章已有封面，不重新随机。
  const republish = await publishMarkdown({
    title: "随机封面文章",
    content: "更新后的正文",
    slug: undefined,
  });
  void republish;
  const { prisma: p2 } = await import("../src/lib/prisma");
  const afterUpdate = await p2.post.findUnique({ where: { id: result.post.id } });
  assert.equal(afterUpdate?.coverImage, post?.coverImage, "更新不应重新随机封面");
});

test("frontmatter project assigns the post; unknown project rejected with 400", async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.project.create({ data: { name: "旅行计划", slug: "travel" } });

  const ok = await publishMarkdown({
    title: "项目内笔记",
    content: "---\nproject: 旅行计划\n---\n正文",
  });
  const post = await prisma.post.findUnique({ where: { id: ok.post.id } });
  assert.ok(post?.projectId, "frontmatter project 应解析为项目关联");

  await assert.rejects(
    () => publishMarkdown({ title: "未知项目2", content: "正文", project: "不存在的项目" }),
    { status: 400 }
  );
});

test("code fences never become tags; body hashtags still do", async () => {
  const result = await publishMarkdown({
    title: "代码标签噪音",
    content: [
      "```c",
      "#include <stdio.h>",
      "#define MAX 10",
      "```",
      "正文提到 `#include` 行内代码，以及真实的 #随笔 标签。",
    ].join("\n"),
  });

  const { prisma } = await import("../src/lib/prisma");
  const post = await prisma.post.findUnique({
    where: { id: result.post.id },
    include: { tags: { include: { tag: true } } },
  });
  const names = (post?.tags ?? []).map((t) => t.tag.name);
  assert.ok(!names.includes("include"), "代码块里的 #include 不得成为标签");
  assert.ok(names.includes("随笔"), "正文真实标签正常提取");
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

test("publishMarkdown does not rename a category merely because the slug matches", async () => {
  const { prisma } = await import("../src/lib/prisma");
  const existing = await prisma.category.create({ data: { name: "C++", slug: "c" } });

  const result = await publishMarkdown({
    content: [
      "---",
      "title: 分类名只共 slug",
      "category: C",
      "published: true",
      "---",
      "",
      "正文",
    ].join("\n"),
  });

  const post = await prisma.post.findUnique({
    where: { id: result.post.id },
    include: { category: true },
  });
  assert.equal(post?.category?.id, existing.id, "同名 slug 应复用已有分类");
  const reloaded = await prisma.category.findUnique({ where: { id: existing.id } });
  assert.equal(reloaded?.name, "C++", "frontmatter 不应隐式重命名共享分类");
  assert.equal(await prisma.category.count({ where: { slug: "c" } }), 1);
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
