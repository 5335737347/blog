#!/usr/bin/env node
/**
 * 把 MEDIA_ROOT/music 目录下没有数据库记录的音频文件批量导入 Music 表。
 *
 *   node apps/api/scripts/import-music-files.mjs            # 预览（不写库）
 *   node apps/api/scripts/import-music-files.mjs --write    # 实际导入
 *
 * 背景：音乐列表 = Music 表（行为权威），只把文件放进目录不会出现在
 * 后台「资源管理」里。此前上传过的歌若只剩文件（库被清过/换过库），
 * 用这个脚本按文件名重建记录；标题取「文件名去扩展名」。
 * 数据库连接与 .env 加载由 repository 根目录的 prisma 配置负责，
 * 必须在仓库根目录运行。默认 dry-run，加 --write 才落库。
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { databaseFilePath, loadProjectEnv, repositoryRoot } from "../../../scripts/load-env.mjs";

// .env 先于任何依赖 DATABASE_URL 的读取；与 update/smoke 脚本同一加载入口。
loadProjectEnv();

const writeMode = process.argv.includes("--write");
// 以仓库根解析（cwd 随运行位置漂移）；MEDIA_ROOT 已配置时以它为准。
const musicDir = path.join(
  process.env.MEDIA_ROOT || path.join(repositoryRoot, "apps/web/public"),
  "music"
);
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|webm)$/i;

const adapter = new PrismaBetterSqlite3({ url: `file:${databaseFilePath()}` });
const prisma = new PrismaClient({ adapter });

let entries;
try {
  entries = await readdir(musicDir, { withFileTypes: true });
} catch {
  console.error(`音乐目录不存在：${musicDir}`);
  process.exit(1);
}

const files = entries
  .filter((entry) => entry.isFile() && AUDIO_EXT_RE.test(entry.name))
  .map((entry) => entry.name);

const existing = new Set(
  (await prisma.music.findMany({ select: { url: true } }))
    .map((row) => row.url.replace("/music/", ""))
);

const missing = files.filter((name) => !existing.has(name));

console.log(`目录：${musicDir}`);
console.log(`文件 ${files.length} 个，库内记录 ${existing.size} 条，待导入 ${missing.length} 个`);
for (const name of missing) {
  console.log(`  ${writeMode ? "导入" : "预览"}：${name} → /music/${name}`);
}

if (missing.length === 0) {
  console.log("没有需要导入的文件。");
} else if (!writeMode) {
  console.log("这是 dry-run；加 --write 实际导入。");
} else {
  // createMany 逐条循环而非批量：数量是个位数，逐条能在个别失败时给出明确文件名。
  let imported = 0;
  for (const name of missing) {
    const title = name.replace(/\.[^.]+$/, "");
    try {
      await prisma.music.create({ data: { title, url: `/music/${name}` } });
      imported += 1;
    } catch (error) {
      console.error(`  失败：${name} — ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`已导入 ${imported}/${missing.length} 条。`);
}

await prisma.$disconnect();
