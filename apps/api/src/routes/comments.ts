import type { FastifyPluginAsync } from "fastify";
import { getAuthUser } from "@/lib/auth";
import { requireAdminSession } from "@/server/auth/auth-service";
import {
  createComment,
  deleteComment,
  listAdminComments,
  listPublicComments,
  moderateComment,
} from "@/server/comments/comment-service";
import { unauthorized } from "@/server/errors";
import { assertRateLimit, requestIp } from "@/server/request-guard";
import { apiSuccess, assertRequestOrigin, guardRequest, positiveInt, sessionToken } from "@/http";

type CommentQuery = { postId?: string; approved?: string; page?: string; limit?: string };
type CommentParams = { id: string };

const commentRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: CommentQuery }>("/comments", async (request) => {
    if (request.query.postId) return apiSuccess(await listPublicComments(request.query.postId));
    const user = await getAuthUser(sessionToken(request));
    if (user?.role !== "ADMIN") throw unauthorized();
    return apiSuccess(await listAdminComments({
      approved: request.query.approved,
      page: positiveInt(request.query.page, 1),
      pageSize: Math.min(50, positiveInt(request.query.limit, 50)),
    }));
  });

  app.post("/comments", async (request, reply) => {
    assertRequestOrigin(request);
    await assertRateLimit(`comments:create:${requestIp(guardRequest(request))}`, 10, 10 * 60 * 1000);
    const user = await getAuthUser(sessionToken(request));
    return reply.status(201).send(apiSuccess(await createComment(request.body as Record<string, unknown>, user)));
  });

  app.put<{ Params: CommentParams }>("/comments/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await moderateComment(request.params.id, request.body as { approved?: unknown }));
  });

  app.delete<{ Params: CommentParams }>("/comments/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteComment(request.params.id));
  });
};

export default commentRoutes;
