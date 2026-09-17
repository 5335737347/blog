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
 * 真的去碰一下数据库。
 *
 * 之前 /health 返回的是写死的 { status: "ok" }——数据库挂了它照样报健康，
 * 监控形同虚设。这里执行一条最轻的查询：能返回就说明连接、文件权限、
 * schema 迁移都还在。
 */
async function probeDatabase(): Promise<boolean> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DATABASE_PROBE_TIMEOUT_MS);
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
