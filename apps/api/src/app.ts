import "@/bootstrap-env";
import crypto from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { apiFailure, apiSuccess, registerErrorHandler } from "@/http";
import { isAllowedOrigin } from "@/server/request-guard";
import { checkHealth } from "@/server/health/health-service";
import { registerCompression } from "@/server/compression";
import authRoutes from "@/routes/auth";
import articleRoutes from "@/routes/articles";
import commentRoutes from "@/routes/comments";
import collectionRoutes from "@/routes/collections";
import mediaRoutes from "@/routes/media";
import publicRoutes from "@/routes/public";
import publishingRoutes from "@/routes/publishing";
import profileRoutes from "@/routes/profile";
import settingsRoutes from "@/routes/settings";
import taxonomyRoutes from "@/routes/taxonomy";

/**
 * 请求 ID。
 *
 * Fastify 默认用的是进程内自增计数器（"1"、"2"…）：重启后从头再来，两轮日志
 * 会撞号，用户报过来的编号也没法定位。这里改成随机 ID，并接受上游传入的值
 * （便于 Nginx / 反向代理串起同一条链路）。
 *
 * 只接受长度受限的可打印 ASCII：请求头是攻击者可控的，直接写进日志就是日志注入
 * （伪造换行、注入假字段、撑爆日志行）。不合规就另生成一个，而不是原样透传。
 */
const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

function resolveRequestId(headers: IncomingHttpHeaders): string {
  const inbound = headers[REQUEST_ID_HEADER];
  const value = Array.isArray(inbound) ? inbound[0] : inbound;
  if (typeof value === "string" && SAFE_REQUEST_ID.test(value)) return value;
  return crypto.randomUUID();
}

export interface BuildAppOptions {
  /**
   * 测试专用：在路由注册阶段收集实际路由表，用来断言来源校验/授权矩阵
   * 没有在新路由加入后过期。生产默认不传。
   */
  onRoute?: (route: { method: string | string[]; url: string }) => void;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    trustProxy: process.env.TRUST_PROXY === "true",
    // Fastify 默认只接受约 1 MiB 的 JSON 请求体，而文章服务允许 100 万字符的
    // 正文（中文 UTF-8 约 3 字节/字）。此前默认值会让约 35 万中文字符的合法
    // 文章在进入服务层之前就以 FST_ERR_CTP_BODY_TOO_LARGE 被拒。
    // 这里显式放宽到 8 MiB，服务层仍按字符数做业务校验。
    bodyLimit: 8 * 1024 * 1024,
    genReqId: (request) => resolveRequestId(request.headers),
  });

  if (options.onRoute) {
    app.addHook("onRoute", (route) => {
      options.onRoute?.({
        method: route.method as string | string[],
        url: route.url,
      });
    });
  }

  // 响应压缩。必须挂在根实例上：Fastify 的 onSend 在注册时刻捕获钩子链，
  // 通过 register 引入的插件钩子不会应用到之后注册的路由（见 compression.ts 注释）。
  registerCompression(app);

  function appendVary(current: string | number | string[] | undefined, value: string) {
    const existing = String(current ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!existing.some((part) => part.toLowerCase() === value.toLowerCase())) {
      existing.push(value);
    }
    return existing.join(", ");
  }

  /**
   * 请求 ID + 缓存策略。
   *
   * GET 且不带 Cookie：公开数据允许短时间共享缓存，减轻重复搜索/翻页请求。
   * 带 Cookie 或 /api/auth/*：响应可能随会话变化，必须 private/no-store，
   * 避免共享缓存把管理员看到的草稿/图库串给匿名访客。
   */
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
    if (request.method !== "GET" || !request.url.startsWith("/api/")) return;

    const hasSessionCookie = Boolean(request.headers.cookie);
    if (hasSessionCookie || request.url.startsWith("/api/auth/")) {
      reply.header("cache-control", "private, no-store");
      reply.header("vary", appendVary(reply.getHeader("vary"), "Cookie"));
    } else if (reply.statusCode >= 400) {
      // 不要把 4xx/5xx 公开缓存：一次数据库抖动可能被 CDN/浏览器放大成整分钟故障。
      reply.header("cache-control", "no-store");
    } else {
      reply.header("cache-control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    }
  });

  app.register(cookie);
  app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 20,
    },
  });
  app.register(cors, {
    credentials: true,
    // 与状态变更请求的同源校验共用一份规则：CORS 原先自己写死了一份列表，
    // 既不知道 127.0.0.1 与 localhost 等价，也不知道 ALLOWED_ORIGINS。
    origin(origin, callback) {
      callback(null, !origin || isAllowedOrigin(origin));
    },
  });

  app.get("/health", async (_request, reply) => {
    const report = await checkHealth();
    // 数据库不可用时返回 503，监控和负载均衡才能据此摘流量。
    // 永远返回 200 的健康检查等于没有检查。
    return reply.status(report.status === "ok" ? 200 : 503).send(apiSuccess(report));
  });

  app.register(async (api) => {
    await api.register(authRoutes);
    await api.register(articleRoutes);
    await api.register(commentRoutes);
    await api.register(collectionRoutes);
    await api.register(mediaRoutes);
    await api.register(publicRoutes);
    await api.register(publishingRoutes);
    await api.register(profileRoutes);
    await api.register(settingsRoutes);
    await api.register(taxonomyRoutes);
  }, { prefix: "/api" });

  // 未匹配路由也走统一失败信封，否则客户端会收到 Fastify 默认的
  // {"statusCode":404,"error":"Not Found",...}，与 Contracts/OpenAPI 不一致。
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(apiFailure("接口不存在", "NOT_FOUND"))
  );

  app.setErrorHandler((error, _request, reply) => registerErrorHandler(reply, error));
  return app;
}
