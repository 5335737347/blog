#!/usr/bin/env node
/**
 * 从 backups/ 恢复。
 *
 *   npm run db:restore -- backups/dev.db.20260917-013832.bak
 *   npm run db:restore -- backups/dev.db.20260917-013832.bak --yes
 *
 *   npm run media:restore -- backups/media/20260917-013832 --yes
 *
 * 不带 --yes 只做校验和预览（dry run），不会写入任何东西。
 *
 * 设计取舍：
 * - 覆盖前先校验候选文件，绝不把一个坏文件盖到线上库上。
 * - 覆盖前自动把当前库另存一份，误操作的恢复本身可以再恢复回来。
 * - 媒体恢复是**合并**而不是替换：MEDIA_ROOT 默认指向 apps/web/public，
 *   那里同时放着 Next 的静态资源，整目录替换会连带删掉仓库里的文件。
 */
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  databaseFilePath,
  loadProjectEnv,
  mediaRootPath,
  repositoryRoot as repoRoot,
} from "./load-env.mjs";

loadProjectEnv();

const backupDir = path.join(repoRoot, "backups");
const databaseFile = databaseFilePath;
const mediaRoot = mediaRootPath;

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function relative(target) {
  return path.relative(repoRoot, target);
}

/**
 * 打开候选库做只读体检。
 *
 * 分两步：integrity_check 决定「这个文件是不是完好的 SQLite 库」，
 * 行数统计只是给人看的预览。备份可能来自更早的 schema，那时统计会失败，
 * 但这不该阻断恢复——只提示恢复后需要跑 migrate deploy。
 */
async function inspectDatabase(file) {
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) });
  try {
    let integrity;
    try {
      integrity = await prisma.$queryRawUnsafe("PRAGMA integrity_check");
    } catch (error) {
      // Prisma 的报错是多行且带调用栈提示的，取最后一行有效信息即可。
      const raw = error instanceof Error ? error.message : String(error);
      const concise =
        raw.split("\n").map((line) => line.trim()).filter(Boolean).pop() ?? raw;
      return { ok: false, reason: `不是有效的 SQLite 数据库（${concise}）` };
    }
    if (!Array.isArray(integrity) || integrity[0]?.integrity_check !== "ok") {
      return { ok: false, reason: "integrity_check 未通过" };
    }

    try {
      const [posts, users, comments, profile] = await Promise.all([
        prisma.post.count(),
        prisma.user.count(),
        prisma.comment.count(),
        prisma.profile.count(),
      ]);
      return { ok: true, stats: { posts, users, comments, profile } };
    } catch {
      return { ok: true, stats: null };
    }
  } finally {
    await prisma.$disconnect();
  }
}

function describeStats(health) {
  if (!health.stats) {
    return "完整性通过；行数统计不可用（备份的 schema 早于当前 Prisma Client，恢复后需执行 prisma migrate deploy）";
  }
  const { posts, users, comments, profile } = health.stats;
  return `文章 ${posts}、用户 ${users}、评论 ${comments}、资料 ${profile}`;
}

function runBackupScript(destination) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, "apps/api/scripts/backup-sqlite.mjs"), destination],
      { stdio: "inherit", env: process.env, cwd: repoRoot }
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`备份脚本退出码 ${code}`))
    );
  });
}

async function restoreDatabase(candidate, confirmed) {
  if (!existsSync(candidate)) {
    throw new Error(`找不到备份文件：${relative(candidate)}`);
  }

  const source = databaseFile();
  console.log(`[restore] 备份文件：${relative(candidate)}`);
  console.log(`[restore] 目标数据库：${relative(source)}`);

  const health = await inspectDatabase(candidate);
  if (!health.ok) {
    throw new Error(`备份文件不可用（${health.reason}），已中止，未改动任何数据。`);
  }
  console.log(`[restore] 校验通过：${describeStats(health)}`);

  if (!confirmed) {
    console.log("[restore] 这是预览（dry run）。确认无误后加 --yes 执行覆盖。");
    return;
  }

  // 先把当前库另存一份：误恢复本身也要能恢复回来。
  if (existsSync(source)) {
    await mkdir(backupDir, { recursive: true });
    const safety = path.join(backupDir, `dev.db.before-restore.${timestamp()}.bak`);
    await runBackupScript(safety);
    console.log(`[restore] 当前数据库已另存：${relative(safety)}`);
  }

  await cp(candidate, source, { preserveTimestamps: true });
  console.log(`[restore] 已覆盖 ${relative(source)}`);

  const verify = await inspectDatabase(source);
  if (!verify.ok) {
    throw new Error(`恢复后校验失败（${verify.reason}）！请用上面的 before-restore 快照回滚。`);
  }
  console.log(`[restore] 恢复后校验通过：${describeStats(verify)}`);
}

async function measure(directory) {
  let files = 0;
  let bytes = 0;
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        files += 1;
        bytes += (await stat(full)).size;
      }
    }
  };
  await walk(directory);
  return { files, bytes };
}

async function restoreMedia(candidate, confirmed) {
  if (!existsSync(candidate)) {
    throw new Error(`找不到媒体快照：${relative(candidate)}`);
  }

  const target = mediaRoot();
  const source = await measure(candidate);
  console.log(`[restore] 媒体快照：${relative(candidate)}（${source.files} 个文件）`);
  console.log(`[restore] 目标目录：${relative(target)}`);

  if (!confirmed) {
    console.log("[restore] 这是预览（dry run）。确认无误后加 --yes 执行合并。");
    return;
  }

  // 合并而不是替换：MEDIA_ROOT 默认是 apps/web/public，里面还放着仓库自带的静态资源。
  await mkdir(target, { recursive: true });
  await cp(candidate, target, { recursive: true, preserveTimestamps: true });
  console.log("[restore] 已合并（同名文件被覆盖，快照里没有的文件保持原样）");
  console.log("[restore] 注意：合并不会删除快照生成之后新增的文件。");
}

const mode = process.argv[2];
const target = process.argv[3];
const confirmed = process.argv.includes("--yes");

try {
  if (!mode || !target || target.startsWith("--")) {
    throw new Error("用法：node scripts/restore.mjs <db|media> <备份路径> [--yes]");
  }
  if (mode !== "db" && mode !== "media") {
    throw new Error(`未知的恢复类型：${mode}（可用：db、media）`);
  }

  const resolved = path.isAbsolute(target) ? target : path.resolve(repoRoot, target);

  // 恢复期间 API 必须停止：它持有数据库连接和 WAL。
  console.warn("[restore] 请先停止 API 进程（pm2 stop blog-api），否则恢复会被覆盖或损坏。\n");

  if (mode === "db") {
    await restoreDatabase(resolved, confirmed);
  } else {
    await restoreMedia(resolved, confirmed);
  }
} catch (error) {
  // 这类错误（备份损坏、路径写错）是用户可以自己修的，只需要一行说明，
  // 打印堆栈反而把真正的原因埋掉。
  console.error(`[restore] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
