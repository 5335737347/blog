/**
 * 冒烟检查用的最小数据：一篇已发布文章 + 一个分类 + 一个标签。
 *
 * 只用于 scripts/smoke.mjs 起的临时库，不写入开发库或生产库。
 * 目标库通过 SMOKE_SEED_DATABASE_URL 传入（缺省时拒绝执行，避免误写）。
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.SMOKE_SEED_DATABASE_URL || process.env.DATABASE_URL;
if (!process.env.SMOKE_SEED_DATABASE_URL) {
  console.error("拒绝执行：必须显式设置 SMOKE_SEED_DATABASE_URL，避免误写非临时数据库。");
  process.exit(1);
}

const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

const content = [
  "# 冒烟测试文章",
  "",
  "用于验证文章页能渲染正文、目录与代码块。",
  "",
  "## 第一节",
  "",
  "正文段落，用于检查阅读列宽度与行高是否生效。",
  "",
  "```ts",
  "const answer: number = 42;",
  "```",
  "",
  "## 第二节",
  "",
  "第二段正文。",
].join("\n");

const category = await prisma.category.create({ data: { name: "冒烟分类", slug: "smoke-category" } });
const tag = await prisma.tag.create({ data: { name: "冒烟标签", slug: "smoke-tag" } });

await prisma.post.create({
  data: {
    slug: "smoke-post",
    title: "冒烟测试文章",
    excerpt: "冒烟检查用文章。",
    content,
    published: true,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    categoryId: category.id,
    tags: { create: [{ tagId: tag.id }] },
  },
});

// 已知凭据只存在于本次临时冒烟库，用于浏览器层登录/权限流检查。
const adminPassword = "smoke-admin-password";
const userPassword = "smoke-user-password";
await prisma.user.create({
  data: {
    username: "smoke-admin",
    displayName: "冒烟管理员",
    email: "smoke-admin@example.com",
    password: await bcrypt.hash(adminPassword, 10),
    role: "ADMIN",
  },
});
await prisma.user.create({
  data: {
    username: "smoke-user",
    displayName: "冒烟用户",
    email: "smoke-user@example.com",
    password: await bcrypt.hash(userPassword, 10),
    role: "USER",
  },
});

console.log(
  `  已写入 1 篇文章 / 1 个分类 / 1 个标签 / 2 个用户 → ${databaseUrl}`
);
await prisma.$disconnect();
