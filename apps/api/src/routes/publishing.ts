import type { FastifyPluginAsync } from "fastify";
import { requireAdminSession, verifyPublishApiKey } from "@/server/auth/auth-service";
import type { PublishInput } from "@/server/publishing/publishing-service";
import {
  importFiles,
  MAX_IMPORT_FILE_SIZE,
  publishMarkdown,
} from "@/server/publishing/publishing-service";
import { assertRateLimit, requestIp } from "@/server/request-guard";
import {
  apiSuccess,
  assertRequestOrigin,
  guardRequest,
  multipartFiles,
  requestBody,
  sessionToken,
} from "@/http";

const publishingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/publish", async (request, reply) => {
    // 这里的凭据是 Authorization: Bearer <apiKey>，属于「显式携带」而非 Cookie，
    // 因此严格来说不存在 CSRF（跨站页面无法让浏览器自动附带它）。
    // 仍然加上来源校验是为了保持一条无例外的规则：**所有变更类端点都检查来源**。
    // 规则没有例外，才能用一个不带豁免名单的测试把它锁住；否则下一个人给
    // /publish 加上 Cookie 认证时不会想起这里少了一道闸门。
    // CLI 发布不发送 Origin，assertSameOrigin 对无 Origin 的请求是放行的，不受影响。
    assertRequestOrigin(request);
    const authorization = request.headers.authorization || "";
    const apiKey = authorization.replace(/^Bearer\s+/i, "");
    await assertRateLimit(`publish:${requestIp(guardRequest(request))}`, 30, 15 * 60 * 1000);
    await verifyPublishApiKey(apiKey);
    return reply.status(201).send(apiSuccess(await publishMarkdown(requestBody<PublishInput>(request))));
  });

  app.post("/import", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    // 导入是唯一的多文件端点：按服务层的单文件上限（10MB）与一次导入的合理
    // 批量（10 个）收紧，避免请求把远大于业务上限的数据先读进内存再逐个拒绝。
    const { files } = await multipartFiles(request, {
      files: 10,
      fileSize: MAX_IMPORT_FILE_SIZE,
    });
    return reply.status(201).send(apiSuccess(await importFiles(files)));
  });
};

export default publishingRoutes;
