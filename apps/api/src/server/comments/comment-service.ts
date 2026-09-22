import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { badRequest, notFound } from "@/server/errors";
import {
  adminCommentSelect,
  publicCommentSelect,
  toAdminCommentDto,
  toPublicCommentDto,
} from "./comment-dto";

export interface CommentCreateInput {
  postId?: unknown;
  parentId?: unknown;
  author?: unknown;
  email?: unknown;
  content?: unknown;
}

export interface ListAdminCommentsOptions {
  approved?: string | null;
  /** "post" 只看文章评论，"guestbook" 只看留言板，其它值表示不筛选。 */
  scope?: string | null;
  page: number;
  pageSize: number;
}

interface CommentAccountRow {
  username: string;
  displayName: string | null;
  email: string | null;
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function optionalText(value: unknown): string | null {
  const valueText = trimmedString(value);
  return valueText || null;
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function approvedFilter(value: string | null | undefined): boolean | undefined {
  if (value === "true" || value === "approved") return true;
  if (value === "false" || value === "pending") return false;
  return undefined;
}

/**
 * 一页最多返回多少条顶层评论。
 *
 * 之前这里没有分页：一次性把全部已审核评论读进内存，再用 500 条硬上限静默截断，
 * 响应里连 total 都没有，前端无从知道还有没有更早的评论。现在改为标准分页
 * （与文章列表相同的 PaginatedResult 形状）。
 */
export const MAX_PUBLIC_COMMENT_PAGE_SIZE = 50;
export const DEFAULT_PUBLIC_COMMENT_PAGE_SIZE = 20;

/**
 * 公开评论串的归属：某篇文章，或留言板（postId 为 null）。
 *
 * 留言板没有独立的数据表——它只是「postId 为 null 的评论」，因此自动继承
 * 先审后发、二级回复、登录身份防伪和频率限制。
 */
type CommentOwner = { postId: string } | { postId: null };

export interface ListPublicCommentsOptions {
  page: number;
  pageSize: number;
}

async function listApprovedRoots(owner: CommentOwner, options: ListPublicCommentsOptions) {
  const where = {
    postId: owner.postId,
    approved: true,
    parentId: null,
  };

  // createdAt 单独排序不是全序：同一秒内插入的评论顺序由 SQLite 决定且可能变化，
  // 分页时会导致某条评论重复出现或被整条跳过。补 id 作为稳定的第二排序键。
  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: publicCommentSelect,
    }),
    prisma.comment.count({ where }),
  ]);

  return {
    items: comments.map(toPublicCommentDto),
    total,
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.ceil(total / options.pageSize),
  };
}

export async function listPublicComments(postId: string, options: ListPublicCommentsOptions) {
  if (!postId) {
    throw badRequest("缺少 postId");
  }
  return listApprovedRoots({ postId }, options);
}

export async function listPublicGuestbook(options: ListPublicCommentsOptions) {
  return listApprovedRoots({ postId: null }, options);
}

export async function listAdminComments(options: ListAdminCommentsOptions) {
  const approved = approvedFilter(options.approved);
  const scope = options.scope === "guestbook" || options.scope === "post" ? options.scope : undefined;

  const where = {
    ...(approved !== undefined ? { approved } : {}),
    // 留言板与文章评论共用一张表，审核时按来源分开看才不会混在一起。
    ...(scope === "guestbook" ? { postId: null } : {}),
    ...(scope === "post" ? { postId: { not: null } } : {}),
  };

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: adminCommentSelect,
    }),
    prisma.comment.count({ where }),
  ]);

  return {
    items: comments.map(toAdminCommentDto),
    total,
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.ceil(total / options.pageSize),
  };
}

async function createCommentRecord(
  input: CommentCreateInput,
  user: AuthUser | null | undefined,
  owner: CommentOwner
) {
  const parentId = optionalText(input.parentId);
  let author = trimmedString(input.author);
  let email = optionalText(input.email)?.toLowerCase() ?? null;
  const content = trimmedString(input.content);

  if (user) {
    const accounts = await prisma.$queryRaw<CommentAccountRow[]>`
      SELECT "username", "displayName", "email"
      FROM "User"
      WHERE "id" = ${user.userId}
      LIMIT 1
    `;
    const account = accounts[0];
    if (account) {
      author = account.displayName || account.username;
      email = account.email;
    }
  }

  if (!author || !content) {
    throw badRequest("缺少必要字段");
  }

  if (author.length > 32) {
    throw badRequest("昵称不能超过 32 个字符");
  }
  if (email && (!validEmail(email) || email.length > 254)) {
    throw badRequest("邮箱格式不正确");
  }
  if (content.length > 2000) {
    throw badRequest("评论内容过长（最多2000字）");
  }

  // 留言板无需校验文章；文章评论必须指向一篇已发布的文章。
  if (owner.postId !== null) {
    const post = await prisma.post.findUnique({
      where: { id: owner.postId, published: true },
    });
    if (!post) {
      throw notFound("文章不存在");
    }
  }

  if (parentId) {
    // postId 参与匹配：防止把文章评论的 id 当作留言板的父级（反之亦然）。
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, postId: owner.postId, approved: true },
    });
    if (!parent) {
      throw badRequest("父评论不存在");
    }
    if (parent.parentId) {
      throw badRequest("不支持多级嵌套回复");
    }
  }

  const commentId = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "Comment" ("id", "author", "email", "content", "approved", "postId", "parentId", "userId")
    VALUES (${commentId}, ${author}, ${email}, ${content}, ${false}, ${owner.postId}, ${parentId}, ${user?.userId || null})
  `;

  return { id: commentId, pendingReview: true };
}

export async function createComment(input: CommentCreateInput, user?: AuthUser | null) {
  const postId = trimmedString(input.postId);
  if (!postId) {
    throw badRequest("缺少必要字段");
  }
  return createCommentRecord(input, user, { postId });
}

/**
 * 留言板留言。刻意忽略请求体里的 postId：归属由端点决定，不由客户端决定。
 */
export async function createGuestbookEntry(input: CommentCreateInput, user?: AuthUser | null) {
  return createCommentRecord(input, user, { postId: null });
}

export async function moderateComment(id: string, input: { approved?: unknown }) {
  if (typeof input.approved !== "boolean") {
    throw badRequest("缺少 approved 字段");
  }

  const existing = await prisma.comment.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound("评论不存在");

  const comment = await prisma.comment.update({
    where: { id },
    data: { approved: input.approved },
    select: adminCommentSelect,
  });

  return toAdminCommentDto(comment);
}

export async function deleteComment(id: string) {
  const existing = await prisma.comment.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound("评论不存在");
  await prisma.comment.delete({ where: { id } });
  return { deleted: true };
}
