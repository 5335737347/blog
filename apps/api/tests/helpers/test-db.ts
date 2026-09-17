import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// 环境隔离只有一份实现（tests/helpers/offline-env.ts）。
// 它同时是 `tsx --test --import` 的全局入口；这里再 import 一次，
// 是为了让「直接运行单个测试文件、不带 --import」时同样生效。
import "./offline-env";

export const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");

/**
 * 为测试文件准备一个独立的临时 SQLite 库。
 *
 * 每个测试文件在独立进程里运行，因此各自拿到一个临时库，互不干扰。
 */
export function createTestDatabase(prefix = "kpblog-test-") {
  const tempDir = mkdtempSync(path.join(tmpdir(), prefix));
  const databasePath = path.join(tempDir, "test.db");

  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.JWT_SECRET ||= "test-secret-for-service-tests-000000";
  process.env.SITE_URL ||= "http://localhost:3000";

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);

  return {
    databasePath,
    cleanup() {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

/**
 * 准备一个临时媒体目录，并把它设为 MEDIA_ROOT。
 * 返回还原函数，避免污染同进程内的其它测试。
 */
export function createTestMediaRoot(prefix = "kpblog-media-") {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const previous = process.env.MEDIA_ROOT;
  process.env.MEDIA_ROOT = dir;

  return {
    dir,
    restore() {
      if (previous === undefined) delete process.env.MEDIA_ROOT;
      else process.env.MEDIA_ROOT = previous;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
