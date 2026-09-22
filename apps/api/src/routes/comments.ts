import type { FastifyPluginAsync } from "fastify";
import { getOptionalAuthSession, requireAdminSession } from "@/server/auth/auth-service";
import type { CommentCreateInput } from "@/server/comments/comment-service";
import {
  createComment,
  createGuestbookEntry,
  deleteComment,
  DEFAULT_PUBLIC_COMMENT_PAGE_SIZE,
  listAdminComments,
  listPublicComments,
  MAX_PUBLIC_COMMENT_PAGE_SIZE,
  moderateComment,
} from "@/server/comments/comment-service";
import { assertRateLimit, requestIp } from "@/server/request-guard";
import { apiSuccess, assertRequestOrigin, guardRequest, pageNumber, positiveInt, requestBody, sessionToken } from "@/http";

type CommentQuery = {
  postId?: string;
  approved?: string;
  scope?: string;
  page?: string;
  limit?: string;
};
type CommentParams = { id: string };

const commentRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: CommentQuery }>("/comments", async (request) => {
    if (request.query.postId) {
      return apiSuccess(await listPublicComments(request.query.postId, {
        page: pageNumber(request.query.page),
        pageSize: Math.min(
          MAX_PUBLIC_COMMENT_PAGE_SIZE,
          positiveInt(request.query.limit, DEFAULT_PUBLIC_COMMENT_PAGE_SIZE)
        ),
      }));
    }
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await listAdminComments({
      approved: request.query.approved,
      scope: request.query.scope,
      page: pageNumber(request.query.page),
      pageSize: Math.min(50, positiveInt(request.query.limit, 50)),
    }));
  });

  app.post("/comments", async (request, reply) => {
    assertRequestOrigin(request);
    await assertRateLimit(`comments:create:${requestIp(guardRequest(request))}`, 10, 10 * 60 * 1000);
    const input = requestBody<CommentCreateInput>(request);
    const user = await getOptionalAuthSession(sessionToken(request));
    return reply.status(201).send(apiSuccess(await createComment(input, user)));
  });

  // 留言板与文章评论共用一张表、一套审核，但配额独立计数：
  // 否则刷留言板会把某人的文章评论额度一起用光。
  app.post("/guestbook", async (request, reply) => {
    assertRequestOrigin(request);
    await assertRateLimit(`guestbook:create:${requestIp(guardRequest(request))}`, 10, 10 * 60 * 1000);
    const input = requestBody<CommentCreateInput>(request);
    const user = await getOptionalAuthSession(sessionToken(request));
    return reply.status(201).send(apiSuccess(await createGuestbookEntry(input, user)));
  });

  app.put<{ Params: CommentParams }>("/comments/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await moderateComment(request.params.id, requestBody<{ approved?: unknown }>(request)));
  });

  app.delete<{ Params: CommentParams }>("/comments/:id", async (request) => {
    assertRequestOrigin(request);
    await requireAdminSession(sessionToken(request));
    return apiSuccess(await deleteComment(request.params.id));
  });
};

export default commentRoutes;
