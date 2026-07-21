import type { FastifyPluginAsync } from "fastify";
import { requireAdminSession, verifyPublishApiKey } from "@/server/auth/auth-service";
import { importFiles, publishMarkdown } from "@/server/publishing/publishing-service";
import { assertRateLimit, requestIp } from "@/server/request-guard";
import {
  apiSuccess,
  assertRequestOrigin,
  guardRequest,
  multipartFiles,
  sessionToken,
} from "@/http";

const publishingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/publish", async (request, reply) => {
    const authorization = request.headers.authorization || "";
    const apiKey = authorization.replace(/^Bearer\s+/i, "");
    await assertRateLimit(`publish:${requestIp(guardRequest(request))}`, 30, 15 * 60 * 1000);
    await verifyPublishApiKey(apiKey);
    return reply.status(201).send(apiSuccess(await publishMarkdown(request.body as Record<string, unknown>)));
  });

  app.post("/import", async (request, reply) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    const { files } = await multipartFiles(request);
    return reply.status(201).send(apiSuccess(await importFiles(files)));
  });
};

export default publishingRoutes;
