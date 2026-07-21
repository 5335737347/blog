import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function envText(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error("Refusing to reset production data. Set ALLOW_PRODUCTION_SEED=true to continue.");
  }
  const { prisma } = await import("../apps/api/src/lib/prisma");
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.comment.deleteMany();
  await prisma.tagOnPost.deleteMany();
  await prisma.post.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();

  // Create admin user.
  const adminUsername = envText("ADMIN_USERNAME", "admin");
  const adminDisplayName = envText("ADMIN_DISPLAY_NAME", "管理员");
  const configuredAdminPassword = process.env.ADMIN_PASSWORD?.trim();
  const adminPassword =
    configuredAdminPassword || crypto.randomBytes(18).toString("base64url");
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      password: hashedPassword,
    },
  });
  await prisma.$executeRaw`
    UPDATE "User"
    SET "displayName" = ${adminDisplayName}, "role" = 'ADMIN'
    WHERE "id" = ${admin.id}
  `;
  console.log(`  ✓ Admin user created: ${adminUsername}`);
  if (!configuredAdminPassword) {
    console.log(`  ⚠ Temporary admin password: ${adminPassword}`);
    console.log("    Set ADMIN_PASSWORD before seeding to choose your own password.");
  }

  // Create categories
  const tech = await prisma.category.create({
    data: { name: "技术", slug: "tech" },
  });
  await prisma.category.create({
    data: { name: "生活", slug: "life" },
  });
  console.log(`  ✓ Categories: tech, life`);

  // Create tags
  const jsTag = await prisma.tag.create({
    data: { name: "JavaScript", slug: "javascript" },
  });
  const tsTag = await prisma.tag.create({
    data: { name: "TypeScript", slug: "typescript" },
  });
  const reactTag = await prisma.tag.create({
    data: { name: "React", slug: "react" },
  });
  const nextTag = await prisma.tag.create({
    data: { name: "Next.js", slug: "nextjs" },
  });
  console.log(`  ✓ Tags: javascript, typescript, react, nextjs`);

  // Create posts
  const post1 = await prisma.post.create({
    data: {
      slug: "hello-world",
      title: "欢迎来到我的博客",
      excerpt: "这是我的第一篇博客文章，介绍一下我自己和这个博客。",
      content: `# 欢迎来到我的博客

大家好！这是我的个人博客的第一篇文章。

## 关于我

我是一名热爱编程的开发者，喜欢探索新技术。这个博客将记录我的学习和思考。

## 这个博客

这个博客使用 **Next.js** + **Prisma** + **SQLite** 搭建，支持：

- Markdown 编写文章
- 标签和分类管理
- RSS 订阅
- 暗色模式
- 评论系统

## 技术栈

| 技术 | 用途 |
|------|------|
| Next.js | 全栈框架 |
| Prisma | 数据库 ORM |
| Tailwind CSS | 样式 |
| TypeScript | 类型安全 |

希望你能喜欢这里的内容！
`,
      published: true,
      publishedAt: new Date("2026-06-10"),
      categoryId: tech.id,
      tags: {
        create: [
          { tagId: jsTag.id },
          { tagId: tsTag.id },
          { tagId: nextTag.id },
        ],
      },
    },
  });

  const post2 = await prisma.post.create({
    data: {
      slug: "learning-typescript",
      title: "TypeScript 学习笔记",
      excerpt: "记录我在学习 TypeScript 过程中的一些心得和技巧。",
      content: `# TypeScript 学习笔记

## 为什么选择 TypeScript？

TypeScript 给 JavaScript 带来了**类型安全**，让代码更加健壮。

### 基础类型

\`\`\`typescript
const name: string = "Alice";
const age: number = 30;
const isAdmin: boolean = true;
\`\`\`

### 接口和类型

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
}

type PostStatus = "draft" | "published";
\`\`\`

### 泛型

\`\`\`typescript
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}
\`\`\`

## 总结

TypeScript 是前端开发的必备技能，值得投入时间学习。
`,
      published: true,
      publishedAt: new Date("2026-06-12"),
      categoryId: tech.id,
      tags: {
        create: [{ tagId: tsTag.id }, { tagId: reactTag.id }],
      },
    },
  });

  await prisma.post.create({
    data: {
      slug: "my-coding-setup",
      title: "我的开发环境配置",
      excerpt: "分享一下我日常使用的开发工具和环境配置，包括编辑器、终端和常用插件。",
      content: `# 我的开发环境配置

> 这是一篇尚未完成的草稿...
`,
      published: false,
      categoryId: tech.id,
      tags: {
        create: [{ tagId: jsTag.id }],
      },
    },
  });
  console.log(`  ✓ Posts: 2 published, 1 draft`);

  // Create sample comments
  await prisma.comment.create({
    data: {
      author: "张三",
      email: "zhangsan@example.com",
      content: "写得很棒！期待更多文章。",
      approved: true,
      postId: post1.id,
    },
  });

  await prisma.comment.create({
    data: {
      author: "李四",
      email: "lisi@example.com",
      content: "TypeScript 确实很好用，我最近也在学。",
      approved: true,
      postId: post2.id,
    },
  });

  await prisma.comment.create({
    data: {
      author: "路人甲",
      content: "能不能详细讲一下泛型的使用场景？",
      approved: false,
      postId: post2.id,
    },
  });
  console.log(`  ✓ Comments: 2 approved, 1 pending`);

  // Create settings
  await prisma.setting.create({
    data: { key: "blog_title", value: "鲲鹏の博客" },
  });
  await prisma.setting.create({
    data: {
      key: "blog_description",
      value: "一个 CS 学生的二次元技术博客",
    },
  });
  console.log(`  ✓ Settings: blog title & description`);

  console.log("\n✅ Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../apps/api/src/lib/prisma");
    await prisma.$disconnect();
  });
