import "../apps/api/src/bootstrap-env";
import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) {
  console.error("用法: npx tsx scripts/publish-local.ts <file.md>");
  console.error("本地发布 Markdown（无需 API Key，直接写入开发数据库）");
  process.exit(1);
}

const { publishMarkdown } = await import("../apps/api/src/server/publishing/publishing-service");
const { prisma } = await import("../apps/api/src/lib/prisma");

const content = await readFile(file, "utf8");
const result = await publishMarkdown({ content });
console.log(JSON.stringify(result, null, 2));
await prisma.$disconnect();
