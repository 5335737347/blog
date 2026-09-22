import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-comments-test-");

/** 公开评论列表已改为分页；测试里一次取够，避免断言被分页边界干扰。 */
const PAGE = { page: 1, pageSize: 100 };

let prisma: typeof import("../src/lib/prisma").prisma;
let createComment: typeof import("../src/server/comments/comment-service").createComment;
let listPublicComments: typeof import("../src/server/comments/comment-service").listPublicComments;
let listAdminComments: typeof import("../src/server/comments/comment-service").listAdminComments;
let moderateComment: typeof import("../src/server/comments/comment-service").moderateComment;
let deleteComment: typeof import("../src/server/comments/comment-service").deleteComment;

let postId: string;

before(async () => {
  ({ prisma } = await import("../src/lib/prisma"));
  ({ createComment, listPublicComments, listAdminComments, moderateComment, deleteComment } =
    await import("../src/server/comments/comment-service"));

  const post = await prisma.post.create({
    data: {
      slug: "comment-target",
      title: "评论目标文章",
      content: "正文",
      published: true,
      publishedAt: new Date(),
    },
  });
  postId = post.id;
});

after(async () => {
  await prisma.$disconnect();
  database.cleanup();
});

test("public listing exposes only approved top-level comments with approved replies", async () => {
  const parent = await createComment({ postId, author: "甲", content: "父评论" });
  // 审核流程：父评论必须先公开可见，才允许对它回复。
  await moderateComment(parent.id, { approved: true });

  const approvedReply = await createComment({
    postId,
    parentId: parent.id,
    author: "乙",
    content: "已审核回复",
  });
  const pendingReply = await createComment({
    postId,
    parentId: parent.id,
    author: "丙",
    content: "待审核回复",
  });
  const pendingTop = await createComment({ postId, author: "丁", content: "待审核父评论" });

  await moderateComment(approvedReply.id, { approved: true });
  // pendingReply 与 pendingTop 保持未审核

  const visible = (await listPublicComments(postId, PAGE)).items;
  const ids = visible.map((item) => item.id);
  assert.deepEqual(ids, [parent.id], "只应返回已审核的顶层评论");
  assert.ok(!ids.includes(pendingTop.id), "未审核的顶层评论不应出现");

  const replies = visible[0].replies ?? [];
  assert.deepEqual(
    replies.map((reply) => reply.id),
    [approvedReply.id],
    "未审核的回复不应随父评论一起泄漏"
  );
  assert.ok(!replies.some((reply) => reply.id === pendingReply.id));

  // 公开 DTO 不得包含 email 字段
  assert.equal("email" in visible[0], false);
  assert.equal("email" in replies[0], false);
});

test("public listing rejects a missing postId", async () => {
  await assert.rejects(() => listPublicComments("", PAGE), { status: 400 });
});

test("replies must target an approved top-level comment on the same post", async () => {
  const pending = await createComment({ postId, author: "戊", content: "未审核父评论" });

  // 父评论尚未审核
  await assert.rejects(
    () => createComment({ postId, parentId: pending.id, author: "己", content: "回复" }),
    { status: 400 }
  );

  // 父评论不存在
  await assert.rejects(
    () => createComment({ postId, parentId: "no-such-comment", author: "己", content: "回复" }),
    { status: 400 }
  );

  // 不支持三级嵌套
  await moderateComment(pending.id, { approved: true });
  const reply = await createComment({ postId, parentId: pending.id, author: "己", content: "回复" });
  await moderateComment(reply.id, { approved: true });
  await assert.rejects(
    () => createComment({ postId, parentId: reply.id, author: "庚", content: "三级回复" }),
    { status: 400 }
  );

  // 父评论属于另一篇文章
  const otherPost = await prisma.post.create({
    data: { slug: "other-post", title: "另一篇", content: "x", published: true, publishedAt: new Date() },
  });
  await assert.rejects(
    () => createComment({ postId: otherPost.id, parentId: pending.id, author: "己", content: "跨文章回复" }),
    { status: 400 }
  );
});

test("comments are rejected for missing posts, drafts and invalid input", async () => {
  await assert.rejects(() => createComment({ postId: "missing", author: "甲", content: "内容" }), {
    status: 404,
  });

  const draft = await prisma.post.create({
    data: { slug: "draft-target", title: "草稿", content: "x", published: false },
  });
  await assert.rejects(
    () => createComment({ postId: draft.id, author: "甲", content: "内容" }),
    { status: 404 }
  );
  await assert.rejects(
    () => listPublicComments(draft.id, { page: 1, pageSize: 10 }),
    { status: 404 }
  );

  await assert.rejects(() => createComment({ postId, author: "", content: "内容" }), { status: 400 });
  await assert.rejects(() => createComment({ postId, author: "甲", content: "" }), { status: 400 });
  await assert.rejects(
    () => createComment({ postId, author: "甲".repeat(33), content: "内容" }),
    { status: 400 }
  );
  await assert.rejects(
    () => createComment({ postId, author: "甲", content: "字".repeat(2001) }),
    { status: 400 }
  );
  await assert.rejects(
    () => createComment({ postId, author: "甲", email: "not-an-email", content: "内容" }),
    { status: 400 }
  );
});

test("authenticated comments use the account identity and cannot spoof it", async () => {
  const { hashPassword } = await import("../src/lib/auth");
  const user = await prisma.user.create({
    data: {
      username: "commenter",
      displayName: "真实昵称",
      email: "real@example.com",
      password: await hashPassword("pw-123456789"),
      role: "USER",
    },
  });

  // 传入伪造的 author/email，服务端必须用账号信息覆盖
  const created = await createComment(
    { postId, author: "冒充者", email: "spoof@example.com", content: "登录后评论" },
    { userId: user.id, username: "commenter", role: "USER", displayName: null, tokenVersion: 0 }
  );

  const stored = await prisma.comment.findUnique({ where: { id: created.id } });
  assert.equal(stored?.author, "真实昵称");
  assert.equal(stored?.email, "real@example.com");
  assert.equal(stored?.userId, user.id);
  // 新评论一律进入待审核
  assert.equal(stored?.approved, false);
  assert.deepEqual(created, { id: created.id, pendingReview: true });
});

test("admin listing filters by approval state and delete cascades replies", async () => {
  const pending = await createComment({ postId, author: "待审", content: "待审核内容" });

  const onlyPending = await listAdminComments({ approved: "pending", page: 1, pageSize: 50 });
  assert.ok(onlyPending.items.some((item) => item.id === pending.id));
  assert.ok(onlyPending.items.every((item) => item.approved === false));

  const onlyApproved = await listAdminComments({ approved: "approved", page: 1, pageSize: 50 });
  assert.ok(onlyApproved.items.every((item) => item.approved === true));

  const all = await listAdminComments({ approved: null, page: 1, pageSize: 50 });
  assert.equal(all.total, all.items.length);
  // 管理端 DTO 需要看到 email 才能审核
  assert.ok(all.items.some((item) => "email" in item));

  // 删除父评论应级联删除回复
  const parent = await createComment({ postId, author: "父", content: "父内容" });
  await moderateComment(parent.id, { approved: true });
  const reply = await createComment({ postId, parentId: parent.id, author: "子", content: "子内容" });
  await moderateComment(reply.id, { approved: true });

  assert.deepEqual(await deleteComment(parent.id), { deleted: true });
  assert.equal(await prisma.comment.findUnique({ where: { id: reply.id } }), null);
  await assert.rejects(() => deleteComment(parent.id), { status: 404 });
});

test("moderateComment validates input and existence", async () => {
  const comment = await createComment({ postId, author: "审核", content: "内容" });

  await assert.rejects(() => moderateComment(comment.id, {}), { status: 400 });
  await assert.rejects(() => moderateComment(comment.id, { approved: "yes" }), { status: 400 });
  await assert.rejects(() => moderateComment("no-such-id", { approved: true }), { status: 404 });

  const moderated = await moderateComment(comment.id, { approved: true });
  assert.equal(moderated.approved, true);
  // 可以撤回审核
  const reverted = await moderateComment(comment.id, { approved: false });
  assert.equal(reverted.approved, false);
});

test("public comment pagination neither duplicates nor skips rows when timestamps tie", async () => {
  const post = await prisma.post.create({
    data: {
      slug: "pagination-post",
      title: "分页目标",
      content: "x",
      published: true,
      publishedAt: new Date(),
    },
  });

  const ids: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    const created = await createComment({
      postId: post.id,
      author: `分页${index}`,
      content: `第 ${index} 条`,
    });
    await moderateComment(created.id, { approved: true });
    ids.push(created.id);
  }

  // 全部压成同一个 createdAt：批量导入或同秒提交时这是真实会发生的。
  // 这条测试锁的是「分页遍历必须恰好覆盖每一条」——重复或漏项都会让它失败。
  //
  // 它并不能单独证明 id 第二排序键的必要性：SQLite 目前对平局行的返回顺序是稳定的，
  // 把 id 键去掉这条测试依然通过（已实测）。那个键的作用是把顺序从「碰巧稳定」
  // 变成「有定义」，与文章列表的 POST_ORDER_DESC 保持一致。
  await prisma.comment.updateMany({
    where: { id: { in: ids } },
    data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
  });

  const collected: string[] = [];
  for (let page = 1; page <= 4; page += 1) {
    const result = await listPublicComments(post.id, { page, pageSize: 2 });
    assert.equal(result.total, 7);
    assert.equal(result.totalPages, 4);
    collected.push(...result.items.map((item) => item.id));
  }

  assert.equal(collected.length, 7, "分页遍历不应重复返回同一条评论");
  assert.deepEqual([...collected].sort(), [...ids].sort(), "分页遍历不应漏掉任何评论");
});

test("public comment pagination clamps to the requested page size", async () => {
  const result = await listPublicComments(postId, { page: 1, pageSize: 1 });
  assert.ok(result.items.length <= 1);
  assert.equal(result.pageSize, 1);
  // 超出范围的页返回空列表而不是报错，前端翻页越界时不会炸。
  const beyond = await listPublicComments(postId, { page: 999, pageSize: 10 });
  assert.deepEqual(beyond.items, []);
});
