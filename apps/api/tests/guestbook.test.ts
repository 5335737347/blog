import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-guestbook-test-");

/** 公开列表已改为分页；测试里一次取够，避免断言被分页边界干扰。 */
const PAGE = { page: 1, pageSize: 100 };

let prisma: typeof import("../src/lib/prisma").prisma;
let createComment: typeof import("../src/server/comments/comment-service").createComment;
let createGuestbookEntry: typeof import("../src/server/comments/comment-service").createGuestbookEntry;
let listPublicComments: typeof import("../src/server/comments/comment-service").listPublicComments;
let listPublicGuestbook: typeof import("../src/server/comments/comment-service").listPublicGuestbook;
let listAdminComments: typeof import("../src/server/comments/comment-service").listAdminComments;
let moderateComment: typeof import("../src/server/comments/comment-service").moderateComment;
let deleteComment: typeof import("../src/server/comments/comment-service").deleteComment;

let postId: string;

before(async () => {
  ({ prisma } = await import("../src/lib/prisma"));
  ({
    createComment,
    createGuestbookEntry,
    listPublicComments,
    listPublicGuestbook,
    listAdminComments,
    moderateComment,
    deleteComment,
  } = await import("../src/server/comments/comment-service"));

  const post = await prisma.post.create({
    data: {
      slug: "guestbook-post",
      title: "有评论的文章",
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

test("guestbook entries are stored with a null postId and never leak into article comments", async () => {
  const entry = await createGuestbookEntry({ author: "路人", content: "第一条留言" });
  await moderateComment(entry.id, { approved: true });

  const stored = await prisma.comment.findUnique({ where: { id: entry.id } });
  assert.equal(stored?.postId, null, "留言板条目的 postId 必须为空");
  assert.equal(stored?.approved, true);

  const guestbook = await listPublicGuestbook(PAGE);
  assert.deepEqual(
    guestbook.items.map((item) => item.id),
    [entry.id]
  );
  assert.equal(guestbook.total, 1);

  // 反向隔离：留言板内容不得出现在任何文章的评论区
  const articleComments = await listPublicComments(postId, PAGE);
  assert.ok(!articleComments.items.some((item) => item.id === entry.id));

  // 公开 DTO 不暴露 email
  assert.equal("email" in guestbook.items[0], false);
});

test("the guestbook endpoint ignores a client-supplied postId", async () => {
  // 客户端试图把留言挂到文章上；归属由端点决定，必须被忽略。
  const entry = await createGuestbookEntry({
    postId,
    author: "伪造者",
    content: "我带着 postId 来了",
  });

  const stored = await prisma.comment.findUnique({ where: { id: entry.id } });
  assert.equal(stored?.postId, null, "请求体里的 postId 不应影响留言板归属");
});

test("guestbook moderation reuses the shared review pipeline", async () => {
  const entry = await createGuestbookEntry({ author: "待审", content: "待审核留言" });

  // 未审核前不可见
  let visible = await listPublicGuestbook(PAGE);
  assert.ok(!visible.items.some((item) => item.id === entry.id));

  const admin = await listAdminComments({ approved: "pending", page: 1, pageSize: 50 });
  const row = admin.items.find((item) => item.id === entry.id);
  assert.ok(row, "留言板条目应出现在管理端待审列表里");
  assert.equal(row.scope, "guestbook", "管理端需要能区分留言板与文章评论");
  assert.equal(row.postId, null);
  assert.equal(row.post, null);

  await moderateComment(entry.id, { approved: true });
  visible = await listPublicGuestbook(PAGE);
  assert.ok(visible.items.some((item) => item.id === entry.id));

  // 撤回审核后重新隐藏
  await moderateComment(entry.id, { approved: false });
  visible = await listPublicGuestbook(PAGE);
  assert.ok(!visible.items.some((item) => item.id === entry.id));

  assert.deepEqual(await deleteComment(entry.id), { deleted: true });
});

test("guestbook replies work but cannot cross over to article comments", async () => {
  const parent = await createGuestbookEntry({ author: "楼主", content: "有人吗" });
  await moderateComment(parent.id, { approved: true });

  const reply = await createGuestbookEntry({
    parentId: parent.id,
    author: "回复者",
    content: "有",
  });
  await moderateComment(reply.id, { approved: true });

  const guestbook = await listPublicGuestbook(PAGE);
  const root = guestbook.items.find((item) => item.id === parent.id);
  assert.deepEqual(
    root?.replies?.map((item) => item.id),
    [reply.id]
  );

  // 留言板不能回复文章评论
  const articleComment = await createComment({ postId, author: "文章评论", content: "内容" });
  await moderateComment(articleComment.id, { approved: true });
  await assert.rejects(
    () => createGuestbookEntry({ parentId: articleComment.id, author: "甲", content: "越界回复" }),
    { status: 400 }
  );

  // 文章评论也不能回复留言板
  await assert.rejects(
    () => createComment({ postId, parentId: parent.id, author: "乙", content: "越界回复" }),
    { status: 400 }
  );
});

test("deleting a post cascades its comments but leaves the guestbook intact", async () => {
  const post = await prisma.post.create({
    data: {
      slug: "doomed-post",
      title: "将被删除",
      content: "x",
      published: true,
      publishedAt: new Date(),
    },
  });
  const articleComment = await createComment({ postId: post.id, author: "甲", content: "会消失" });
  const guestbookEntry = await createGuestbookEntry({ author: "乙", content: "不会消失" });

  await prisma.post.delete({ where: { id: post.id } });

  assert.equal(await prisma.comment.findUnique({ where: { id: articleComment.id } }), null);
  assert.ok(
    await prisma.comment.findUnique({ where: { id: guestbookEntry.id } }),
    "postId 为 null 的留言不应被文章的级联删除带走"
  );
});

test("guestbook validation rejects incomplete input without needing a post", async () => {
  await assert.rejects(() => createGuestbookEntry({ author: "", content: "内容" }), { status: 400 });
  await assert.rejects(() => createGuestbookEntry({ author: "甲", content: "" }), { status: 400 });
  await assert.rejects(
    () => createGuestbookEntry({ author: "甲".repeat(33), content: "内容" }),
    { status: 400 }
  );
  await assert.rejects(
    () => createGuestbookEntry({ author: "甲", content: "字".repeat(2001) }),
    { status: 400 }
  );
  await assert.rejects(
    () => createGuestbookEntry({ author: "甲", email: "not-an-email", content: "内容" }),
    { status: 400 }
  );
  // 不存在的父级
  await assert.rejects(
    () => createGuestbookEntry({ parentId: "no-such-comment", author: "甲", content: "内容" }),
    { status: 400 }
  );
});

test("authenticated guestbook entries use the account identity", async () => {
  const { hashPassword } = await import("../src/lib/auth");
  const user = await prisma.user.create({
    data: {
      username: "guestbooker",
      displayName: "留言用户",
      email: "gb@example.com",
      password: await hashPassword("pw-123456789"),
      role: "USER",
    },
  });

  const created = await createGuestbookEntry(
    { author: "冒充者", email: "spoof@example.com", content: "登录后留言" },
    { userId: user.id, username: "guestbooker", role: "USER", displayName: null, tokenVersion: 0 }
  );

  const stored = await prisma.comment.findUnique({ where: { id: created.id } });
  assert.equal(stored?.author, "留言用户");
  assert.equal(stored?.email, "gb@example.com");
  assert.equal(stored?.postId, null);
});

test("admin listing can filter by scope so moderation can separate the two sources", async () => {
  const post = await prisma.post.create({
    data: {
      slug: "scope-filter-post",
      title: "筛选目标",
      content: "x",
      published: true,
      publishedAt: new Date(),
    },
  });
  const articleComment = await createComment({ postId: post.id, author: "文章侧", content: "来自文章" });
  const guestbookEntry = await createGuestbookEntry({ author: "留言侧", content: "来自留言板" });

  const onlyGuestbook = await listAdminComments({ scope: "guestbook", page: 1, pageSize: 100 });
  assert.ok(onlyGuestbook.items.some((item) => item.id === guestbookEntry.id));
  assert.ok(
    onlyGuestbook.items.every((item) => item.postId === null && item.scope === "guestbook"),
    "scope=guestbook 只能返回留言板条目"
  );

  const onlyPosts = await listAdminComments({ scope: "post", page: 1, pageSize: 100 });
  assert.ok(onlyPosts.items.some((item) => item.id === articleComment.id));
  assert.ok(
    onlyPosts.items.every((item) => item.postId !== null && item.scope === "post"),
    "scope=post 只能返回文章评论"
  );

  // 两个筛选互斥且完备：任何一条评论必属于且只属于其中一边。
  const all = await listAdminComments({ page: 1, pageSize: 100 });
  assert.equal(all.total, onlyGuestbook.total + onlyPosts.total);

  // 无法识别的 scope 视为不筛选，而不是返回空列表。
  const bogus = await listAdminComments({ scope: "bogus", page: 1, pageSize: 100 });
  assert.equal(bogus.total, all.total);
});
