import "@/bootstrap-env";
import crypto from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { apiSuccess, registerErrorHandler } from "@/http";
import { isAllowedOrigin } from "@/server/request-guard";
import { checkHealth } from "@/server/health/health-service";
import { registerCompression } from "@/server/compression";
import authRoutes from "@/routes/auth";
import articleRoutes from "@/routes/articles";
import commentRoutes from "@/routes/comments";
import mediaRoutes from "@/routes/media";
import publicRoutes from "@/routes/public";
import publishingRoutes from "@/routes/publishing";
import profileRoutes from "@/routes/profile";
import settingsRoutes from "@/routes/settings";

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

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    trustProxy: process.env.TRUST_PROXY === "true",
    genReqId: (request) => resolveRequestId(request.headers),
  });

  // 响应压缩。必须挂在根实例上：Fastify 的 onSend 在注册时刻捕获钩子链，
  // 通过 register 引入的插件钩子不会应用到之后注册的路由（见 compression.ts 注释）。
  registerCompression(app);

  // 把请求 ID 回给客户端：用户截图报错时能直接给出可在日志里检索的编号。
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
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
    await api.register(mediaRoutes);
    await api.register(publicRoutes);
    await api.register(publishingRoutes);
    await api.register(profileRoutes);
    await api.register(settingsRoutes);
  }, { prefix: "/api" });

  app.setErrorHandler((error, _request, reply) => registerErrorHandler(reply, error));
  return app;
}
