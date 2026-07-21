import "@/bootstrap-env";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { apiSuccess, registerErrorHandler } from "@/http";
import authRoutes from "@/routes/auth";
import articleRoutes from "@/routes/articles";
import commentRoutes from "@/routes/comments";
import mediaRoutes from "@/routes/media";
import publicRoutes from "@/routes/public";
import publishingRoutes from "@/routes/publishing";
import settingsRoutes from "@/routes/settings";

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    trustProxy: process.env.TRUST_PROXY === "true",
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
    origin(origin, callback) {
      const allowed = new Set([
        "http://localhost:3001",
        process.env.SITE_URL,
        process.env.NEXT_PUBLIC_SITE_URL,
      ].filter((value): value is string => Boolean(value)));
      callback(null, !origin || allowed.has(origin));
    },
  });

  app.get("/health", async () => apiSuccess({
    service: "kpblog-api" as const,
    status: "ok" as const,
    version: "2.1.0",
  }));

  app.register(async (api) => {
    await api.register(authRoutes);
    await api.register(articleRoutes);
    await api.register(commentRoutes);
    await api.register(mediaRoutes);
    await api.register(publicRoutes);
    await api.register(publishingRoutes);
    await api.register(settingsRoutes);
  }, { prefix: "/api" });

  app.setErrorHandler((error, _request, reply) => registerErrorHandler(reply, error));
  return app;
}
