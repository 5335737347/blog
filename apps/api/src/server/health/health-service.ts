import { prisma } from "@/lib/prisma";

/**
 * 数据库探针超时。
 *
 * 健康检查会被监控高频轮询，绝不能因为数据库卡住而一起挂起——否则监控端
 * 拿到的是超时而不是「不健康」，运维看到的就是「探测失败」而不是「数据库故障」。
 * 宁可快速返回 503。
 */
const DATABASE_PROBE_TIMEOUT_MS = 2_000;

export interface HealthReport {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds: number;
  checks: { database: "ok" | "error" };
}

// 版本号与 apps/api/package.json 保持一致；改版本时两处一起改。
const API_VERSION = "0.1.0";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`数据库探针超时（${ms}ms）`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * 真的去碰一下数据库，并且确认它**已经迁移过**。
 *
 * 之前这里只跑 `SELECT 1`。SQLite 的行为让这个探针失效：当数据库文件不存在
 * 但目录存在时，better-sqlite3 会静默创建一个 0 字节的空库，`SELECT 1` 照样成功。
 * 于是 `/health` 返回 200 {"status":"ok"}，而所有真实端点 500——监控、负载均衡
 * 和更新脚本的健康检查全部失去意义。
 *
 * 现在改查迁移表：它由 Prisma 迁移创建，只有真正迁移过的库才有；
 * 空库、被截断的库、缺失文件的库都会在这里失败。
 */
async function probeDatabase(): Promise<boolean> {
  try {
    const rows = await withTimeout(
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "_prisma_migrations"
      `,
      DATABASE_PROBE_TIMEOUT_MS
    );
    const applied = Number(rows[0]?.count ?? 0);
    if (!Number.isFinite(applied) || applied < 1) {
      console.error("[health] 数据库没有已应用的迁移（库为空或未部署迁移）");
      return false;
    }
    return true;
  } catch (error) {
    // 细节只进日志，不进响应：健康检查是公开的，不该泄漏数据库路径或错误栈。
    console.error(
      "[health] 数据库探针失败:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

export async function checkHealth(): Promise<HealthReport> {
  const databaseOk = await probeDatabase();
  return {
    status: databaseOk ? "ok" : "degraded",
    version: API_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
    checks: { database: databaseOk ? "ok" : "error" },
  };
}
