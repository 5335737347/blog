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

export async function listPublicComments(postId: string) {
  if (!postId) {
    throw badRequest("缺少 postId");
  }

  const comments = await prisma.comment.findMany({
    where: {
      postId,
      approved: true,
      parentId: null,
    },
    orderBy: { createdAt: "desc" },
    select: publicCommentSelect,
  });

  return comments.map(toPublicCommentDto);
}

export async function listAdminComments(options: ListAdminCommentsOptions) {
  const where = {
    ...(approvedFilter(options.approved) !== undefined
      ? { approved: approvedFilter(options.approved) }
      : {}),
  };

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
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

export async function createComment(input: CommentCreateInput, user?: AuthUser | null) {
  const postId = trimmedString(input.postId);
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

  if (!postId || !author || !content) {
    throw badRequest("缺少必要字段");
  }

  if (author.length > 32) {
    throw badRequest("昵称不能超过 32 个字符");
  }
  if (email && !validEmail(email)) {
    throw badRequest("邮箱格式不正确");
  }
  if (content.length > 2000) {
    throw badRequest("评论内容过长（最多2000字）");
  }

  const post = await prisma.post.findUnique({
    where: { id: postId, published: true },
  });
  if (!post) {
    throw notFound("文章不存在");
  }

  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, postId, approved: true },
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
    VALUES (${commentId}, ${author}, ${email}, ${content}, ${false}, ${postId}, ${parentId}, ${user?.userId || null})
  `;

  return { id: commentId, pendingReview: true };
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
