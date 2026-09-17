import type { Prisma } from "@prisma/client";

export const publicCommentSelect = {
  id: true,
  author: true,
  content: true,
  createdAt: true,
  replies: {
    where: { approved: true },
    // id 作为第二排序键：同秒创建的回复否则顺序不稳定。
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      author: true,
      content: true,
      createdAt: true,
    },
  },
} satisfies Prisma.CommentSelect;

export const adminCommentSelect = {
  id: true,
  author: true,
  email: true,
  content: true,
  approved: true,
  createdAt: true,
  postId: true,
  parentId: true,
  post: {
    select: {
      id: true,
      title: true,
      slug: true,
    },
  },
  parent: {
    select: {
      id: true,
      author: true,
    },
  },
} satisfies Prisma.CommentSelect;

type PublicCommentRecord = Prisma.CommentGetPayload<{
  select: typeof publicCommentSelect;
}>;

type AdminCommentRecord = Prisma.CommentGetPayload<{
  select: typeof adminCommentSelect;
}>;

export function toPublicCommentDto(comment: PublicCommentRecord) {
  return {
    ...comment,
    createdAt: comment.createdAt.toISOString(),
    replies: comment.replies.map((reply) => ({
      ...reply,
      createdAt: reply.createdAt.toISOString(),
    })),
  };
}

export function toAdminCommentDto(comment: AdminCommentRecord) {
  return {
    ...comment,
    createdAt: comment.createdAt.toISOString(),
    // 留言板留言没有所属文章；显式给出 scope，省得管理端靠 post === null 猜。
    scope: comment.postId === null ? ("guestbook" as const) : ("post" as const),
  };
}

export type PublicCommentDto = ReturnType<typeof toPublicCommentDto>;
export type AdminCommentDto = ReturnType<typeof toAdminCommentDto>;
