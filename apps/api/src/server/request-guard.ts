import { networkInterfaces } from "node:os";
import { prisma } from "@/lib/prisma";
import { forbidden, tooManyRequests } from "@/server/errors";

export interface GuardRequest {
  headers: Headers;
  origin: string;
  directIp: string;
}

const LOOPBACK_ALIASES = ["localhost", "127.0.0.1", "[::1]"] as const;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHost(hostname));
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * 本机当前的网卡地址（回环 + 局域网 IPv4）。
 *
 * 开发机的局域网地址由 DHCP 分配，会随时间变化（例如 192.168.1.68 → .71）。
 * 把它写进 ALLOWED_ORIGINS 是一个注定过期的配置，因此改为在运行时枚举本机网卡：
 * 只要请求来源是本机自己的地址，就是合法的开发访问。
 *
 * 仅用于开发环境；生产环境（NODE_ENV=production）不采用这条放宽规则。
 */
function localMachineHosts(): Set<string> {
  const hosts = new Set(LOOPBACK_HOSTS);
  // 受限容器 / seccomp 环境可能让 uv_interface_addresses 直接抛错（实测见
  // next.config.ts 的同名调用）。这里失败只应退化为「仅回环地址可信」，
  // 绝不能把异常抛到请求路径上。
  try {
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === "IPv4" && !address.internal) {
          hosts.add(address.address);
        }
      }
    }
  } catch {
    // 保持仅回环地址；生产环境本来就不用这条开发期放宽规则。
  }
  return hosts;
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>();

  for (const value of [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      // Ignore invalid optional deployment hints.
      continue;
    }
    origins.add(url.origin);

    // localhost / 127.0.0.1 / [::1] 指向同一台机器，但浏览器把它们视作不同 Origin。
    // 开发时用任意一种写法访问都应当可以；只对本机地址扩展，
    // 生产域名（如 https://kpblog.cc）不会因此多出任何允许来源。
    if (isLoopbackHost(url.hostname)) {
      for (const alias of LOOPBACK_ALIASES) {
        origins.add(`${url.protocol}//${url.port ? `${alias}:${url.port}` : alias}`);
      }
    }
  }

  // 额外的显式允许来源（固定局域网地址、临时隧道等），逗号分隔。
  // 提供一个受控入口，避免有人为了绕过校验而关掉整个检查。
  for (const entry of (process.env.ALLOWED_ORIGINS || "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      console.warn(`[request-guard] ALLOWED_ORIGINS 中有非法来源，已忽略: ${trimmed}`);
    }
  }

  return origins;
}

let warnedDevOriginRelaxation = false;
let warnedMissingOriginConfig = false;

/**
 * 判断某个 Origin 是否可信。
 *
 * CORS（app.ts）与状态变更请求的同源校验共用这一份规则，
 * 避免两处各维护一份白名单后逐渐漂移——CORS 原先就自己写死了一份列表，
 * 既不知道 127.0.0.1 别名，也不知道 ALLOWED_ORIGINS。
 */
export function isAllowedOrigin(actual: string): boolean {
  // 精确匹配配置的可信来源。生产环境走到这里就结束——
  // 生产只认 SITE_URL / NEXT_PUBLIC_SITE_URL / ALLOWED_ORIGINS。
  if (configuredOrigins().has(actual)) return true;

  // 开发环境额外放宽：本机自己的地址（含 DHCP 分配的局域网 IP）任意端口都算同源。
  // 这样用手机连 192.168.x.x:3001 调试时，不必在地址变化后回来改配置。
  if (isDevelopment()) {
    try {
      if (localMachineHosts().has(normalizeHost(new URL(actual).hostname))) {
        if (!warnedDevOriginRelaxation) {
          warnedDevOriginRelaxation = true;
          console.info(
            "[request-guard] 开发环境：本机网卡地址（含局域网 IP）已被视为可信来源。" +
              "生产环境不适用此放宽规则。"
          );
        }
        return true;
      }
    } catch {
      // 非法的 Origin 头
    }
  }

  return false;
}

function sameAllowedOrigin(actual: string, request: GuardRequest): boolean {
  if (isAllowedOrigin(actual)) return true;

  // 之前这里无条件把「请求自身的 Host」加入白名单，等于只要 Origin 与 Host 相同就放行。
  // 浏览器无法伪造 Host，所以它不构成 CSRF 绕过；但它会让保护在 SITE_URL 未配置时
  // 静默退化为无效。现在只有在完全未配置可信来源时才走这条兜底，并且明确告警。
  if (configuredOrigins().size > 0) return false;

  if (!warnedMissingOriginConfig) {
    warnedMissingOriginConfig = true;
    console.warn(
      "[request-guard] 未配置 SITE_URL / NEXT_PUBLIC_SITE_URL，同源校验退化为仅比对 Host 头，" +
        "无法防御 DNS rebinding。请在部署环境中配置 SITE_URL。"
    );
  }
  return actual === request.origin;
}

export function assertSameOrigin(request: GuardRequest) {
  const origin = request.headers.get("origin");
  if (origin && !sameAllowedOrigin(origin, request)) {
    throw forbidden("非法请求来源");
  }

  const referer = request.headers.get("referer");
  if (!origin && referer) {
    let refererOrigin: string;
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      throw forbidden("非法请求来源");
    }
    if (!sameAllowedOrigin(refererOrigin, request)) {
      throw forbidden("非法请求来源");
    }
  }
}

/**
 * 客户端 IP。
 *
 * 默认（未开启代理信任）只用 TCP 对端地址——请求头是攻击者可控的。
 *
 * 开启 `TRUST_PROXY` 后只接受**代理会覆盖的单值头**（`x-real-ip` /
 * `cf-connecting-ip`）。这里刻意不支持 `x-forwarded-for`：
 * 它是逗号列表，而 Nginx 常用的 `$proxy_add_x_forwarded_for` 是**追加**语义，
 * 客户端自带的 `X-Forwarded-For: 1.2.3.4` 会留在最左端。此前取最左项，
 * 于是攻击者可以每次请求自选 IP、无限重建限流桶（实测 6/6 次绕过 5 次/小时的发码限额）。
 * 取最右项也依赖「恰好一跳代理」这一未经校验的假设，同样不做。
 */
export function requestIp(request: Pick<GuardRequest, "headers" | "directIp">): string {
  if (process.env.TRUST_PROXY !== "true") {
    return request.directIp.trim() || "unknown-direct-ip";
  }

  const header = process.env.TRUST_PROXY_HEADER?.trim().toLowerCase() || "x-real-ip";
  switch (header) {
    case "cf-connecting-ip":
      return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
    case "x-real-ip":
      return request.headers.get("x-real-ip")?.trim() || "unknown";
    case "x-forwarded-for":
      // 显式拒绝而不是静默忽略：让部署者立刻发现配置没有生效，
      // 否则会以为「按 IP 限流开着」，实际所有人都落进同一个桶。
      warnUnsupportedProxyHeader();
      return "unsupported-proxy-header";
    default:
      return "invalid-proxy-header";
  }
}

let warnedUnsupportedProxyHeader = false;

function warnUnsupportedProxyHeader() {
  if (warnedUnsupportedProxyHeader) return;
  warnedUnsupportedProxyHeader = true;
  console.warn(
    "[request-guard] TRUST_PROXY_HEADER=x-forwarded-for 不受支持：它是可追加的列表头，" +
      '客户端可自选身份。请改为 x-real-ip（Nginx: proxy_set_header X-Real-IP $remote_addr）' +
      "或 cf-connecting-ip，并将限流身份固定为代理覆盖的单值头。"
  );
}

let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export async function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);
  const count = await prisma.$transaction(async (tx) => {
    const existing = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!existing || existing.resetAt.getTime() <= now) {
      await tx.rateLimitBucket.upsert({
        where: { key },
        update: { count: 1, resetAt },
        create: { key, count: 1, resetAt },
      });
      return 1;
    }

    const bucket = await tx.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
      select: { count: true },
    });
    return bucket.count;
  });
  if (count > limit) {
    throw tooManyRequests();
  }

  // 清理过期桶。原来用 Math.random() < 0.01 触发，低流量下过期记录会长期堆积；
  // 改成按时间间隔最多每 5 分钟一次，并且必须捕获拒绝——
  // 未处理的 Promise 拒绝在 Node 默认策略下会直接终止进程。
  if (now - lastSweepAt > SWEEP_INTERVAL_MS) {
    lastSweepAt = now;
    void prisma.rateLimitBucket
      .deleteMany({ where: { resetAt: { lt: new Date(now) } } })
      .catch((error) => {
        console.error("[rate-limit] 清理过期桶失败:", error);
      });
  }
}

/**
 * 只读检查，不增加计数。
 *
 * 用于「只统计失败」的限流：例如登录的账号维度限制。若沿用 assertRateLimit
 * 那种「先加再判」的方式，正常用户多次成功登录也会被计入，
 * 攻击者只要故意输错就能把某个账号锁死（定向 DoS）。
 */
export async function assertRateLimitNotExceeded(
  key: string,
  limit: number,
  options: { message?: string } = {}
) {
  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (!bucket) return;
  const remainingMs = bucket.resetAt.getTime() - Date.now();
  if (remainingMs <= 0) return;
  if (bucket.count >= limit) {
    throw tooManyRequests(options.message, Math.ceil(remainingMs / 1000));
  }
}

/**
 * 记一次失败。窗口内首次失败时建桶，已过期则重新开始计数。
 *
 * `options.maxFailures` 限制这个窗口内最多记录多少次失败（默认不限）。
 * 用途是「允许 N 次尝试」的语义：调用方传入 N，第 N 次失败照常返回 401，
 * 从第 N+1 次起才拒绝。若改成「计数达到 N 就拒绝」，实际只有 N-1 次机会——
 * 第一版就是这么写错的，实测第三次尝试就返回 429（本意是三次错误之后才锁）。
 */
export async function recordRateLimitFailure(
  key: string,
  windowMs: number,
  options: { maxFailures?: number } = {}
) {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);
  const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });

  if (existing && options.maxFailures && existing.count >= options.maxFailures) {
    // 已经记满：不再累加，也不延长窗口，避免攻击者用持续请求把锁续到无限久。
    return;
  }

  if (!existing || existing.resetAt.getTime() <= now) {
    await prisma.rateLimitBucket.upsert({
      where: { key },
      update: { count: 1, resetAt },
      create: { key, count: 1, resetAt },
    });
    return;
  }

  await prisma.rateLimitBucket.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
}

/**
 * 只读查询失败计数（不改变任何状态）。
 *
 * 用于「失败次数达上限但已过冷却期」这类判断：调用方据此决定是否发送
 * 「账号被临时锁定」的提示邮件，而提示本身不能影响计数。
 */
export async function rateLimitFailureCount(key: string): Promise<number> {
  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (!bucket || bucket.resetAt.getTime() <= Date.now()) return 0;
  return bucket.count;
}

/**
 * 原子地申请一次失败名额，返回是否已超出允许次数。
 *
 * 「先读计数、再决定是否拒绝、失败了再 +1」这个三步在并发下会漏：
 * 4 个请求同时到达时可能都读到 count=2，于是全部放行——
 * 实测 4 个并发请求全部返回 401 而锁定没有触发（管理员锁定因此形同虚设）。
 * 这里改成**先加再判**，放在一个事务里，保证每次尝试恰好消耗一个名额：
 *   - 返回 `exceeded: true` 表示这是第 N+1 次（及以后）尝试；
 *   - `count === 1` 表示本窗口刚开桶，此时才写入 `resetAt`，
 *     所以持续请求不会把解锁时间往后推。
 */
export async function consumeFailureAllowance(
  key: string,
  windowMs: number,
  allowed: number
): Promise<{ exceeded: boolean; count: number }> {
  const now = Date.now();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!existing || existing.resetAt.getTime() <= now) {
      await tx.rateLimitBucket.upsert({
        where: { key },
        update: { count: 1, resetAt: new Date(now + windowMs) },
        create: { key, count: 1, resetAt: new Date(now + windowMs) },
      });
      return { exceeded: 1 > allowed, count: 1 };
    }
    const updated = await tx.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
      select: { count: true },
    });
    return { exceeded: updated.count > allowed, count: updated.count };
  });
}

/** 成功后清除计数，避免用户为之前的输错持续买单。 */
export async function clearRateLimit(key: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}

/**
 * 当前限流桶还剩多久解锁（秒）；没有生效中的桶则返回 0。
 *
 * 登录被锁时把它放进响应的 `error.retryAfterSeconds`，
 * 前端（管理员登录页）据此显示「请 N 分钟后再试」，而不是一句无信息量的失败。
 * 只读，不改变任何状态。
 */
export async function rateLimitRetryAfterSeconds(key: string): Promise<number> {
  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (!bucket) return 0;
  const remainingMs = bucket.resetAt.getTime() - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}
