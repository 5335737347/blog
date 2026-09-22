import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-password-test-");

let prisma: typeof import("../src/lib/prisma").prisma;
let requestPasswordReset: typeof import("../src/server/auth/auth-service").requestPasswordReset;
let resetPasswordWithCode: typeof import("../src/server/auth/auth-service").resetPasswordWithCode;
let changeOwnPassword: typeof import("../src/server/auth/auth-service").changeOwnPassword;
let registerUser: typeof import("../src/server/auth/auth-service").registerUser;
let loginUser: typeof import("../src/server/auth/auth-service").loginUser;
let getOptionalAuthSession: typeof import("../src/server/auth/auth-service").getOptionalAuthSession;
let sendVerificationCode: typeof import("../src/server/auth/verification-code-service").sendVerificationCode;

before(async () => {
  ({ prisma } = await import("../src/lib/prisma"));
  ({
    requestPasswordReset,
    resetPasswordWithCode,
    changeOwnPassword,
    registerUser,
    loginUser,
    getOptionalAuthSession,
  } = await import("../src/server/auth/auth-service"));
  ({ sendVerificationCode } = await import("../src/server/auth/verification-code-service"));
  // 本地无 SMTP 时回显验证码，便于断言完整流程。
  process.env.ALLOW_DEBUG_VERIFICATION_CODE = "true";
});

after(async () => {
  delete process.env.ALLOW_DEBUG_VERIFICATION_CODE;
  await prisma.$disconnect();
  database.cleanup();
});

async function createAccount(username: string, password = "original-pw-123456") {
  const email = `${username}@example.com`;
  const code = await sendVerificationCode("register", email);
  const registered = await registerUser({
    username,
    email,
    password,
    verificationCode: code.debugCode,
  });
  return { email, password, token: registered.token };
}

test("email existence is only revealed after consuming a verification code", async () => {
  await createAccount("enum-target");

  // 错误验证码 + 已注册邮箱 → 报验证码错误，而不是暴露邮箱已注册。
  await assert.rejects(
    () =>
      registerUser({
        username: "enum-probe-user",
        email: "enum-target@example.com",
        password: "probe-pw-123456",
        verificationCode: "000000",
      }),
    (error: { message?: string }) =>
      /验证码/.test(error.message ?? "") && !/已被使用/.test(error.message ?? "")
  );

  // 消耗了正确验证码之后才提示占用（此时探测已付出限流代价）。
  const code = await sendVerificationCode("register", "enum-target@example.com");
  await assert.rejects(
    () =>
      registerUser({
        username: "enum-probe-user",
        email: "enum-target@example.com",
        password: "probe-pw-123456",
        verificationCode: code.debugCode,
      }),
    (error: { message?: string }) => /已被使用/.test(error.message ?? "")
  );
});

test("username uniqueness is case-insensitive; login matches case-insensitively", async () => {
  const account = await createAccount("MiXeDcase");

  // 大小写变体注册被拒（与已存在用户名仅大小写不同）。
  const code = await sendVerificationCode("register", "mixedcase-alt@example.com");
  await assert.rejects(
    () =>
      registerUser({
        username: "mixedcase",
        email: "mixedcase-alt@example.com",
        password: "another-pw-12345",
        verificationCode: code.debugCode,
      }),
    (error: { message?: string }) => /已被使用/.test(error.message ?? "")
  );

  // 登录时大小写不敏感：小写变体也能命中唯一账户，会话回填原始用户名。
  const login = await loginUser({ identifier: "mixedcase", password: account.password });
  assert.equal(login.data.user.username, "MiXeDcase");
});

test("password reset does not reveal whether an email is registered", async () => {
  await createAccount("enum-known");

  const known = await requestPasswordReset({ email: "enum-known@example.com" });
  const unknown = await requestPasswordReset({ email: "enum-unknown@example.com" });

  // 两条路径的响应结构必须一致：只有 requested 与 expiresAt，没有 sent/存在性差异
  assert.equal(known.requested, true);
  assert.equal(unknown.requested, true);
  assert.deepEqual(Object.keys(known).sort(), Object.keys(unknown).sort());
  assert.equal(typeof known.expiresAt, "string");
  assert.equal(typeof unknown.expiresAt, "string");
});

test("resetPasswordWithCode sets a new password and revokes existing sessions", async () => {
  const { email, token: oldToken } = await createAccount("reset-flow");

  // 旧令牌可用
  assert.ok(await getOptionalAuthSession(oldToken));

  const issued = await requestPasswordReset({ email });
  assert.match(issued.debugCode ?? "", /^\d{6}$/);

  assert.deepEqual(
    await resetPasswordWithCode({
      email,
      verificationCode: issued.debugCode,
      newPassword: "brand-new-pw-987654",
    }),
    { reset: true }
  );

  // 关键：重置后旧会话必须立即失效（tokenVersion 已自增）
  assert.equal(await getOptionalAuthSession(oldToken), null);

  // 旧密码不再可用，新密码可用
  await assert.rejects(() => loginUser({ identifier: email, password: "original-pw-123456" }), {
    status: 401,
  });
  const relogin = await loginUser({ identifier: email, password: "brand-new-pw-987654" });
  assert.equal(relogin.data.loggedIn, true);
});

test("resetPasswordWithCode rejects wrong, reused and unknown-target attempts", async () => {
  const { email } = await createAccount("reset-reject");
  const issued = await requestPasswordReset({ email });

  // 验证码格式错误
  await assert.rejects(
    () => resetPasswordWithCode({ email, verificationCode: "12345", newPassword: "another-pw-123456" }),
    { status: 400 }
  );
  // 验证码不正确
  await assert.rejects(
    () => resetPasswordWithCode({ email, verificationCode: "000000", newPassword: "another-pw-123456" }),
    { status: 400 }
  );
  // 弱密码：即便验证码正确也必须先被拒
  await assert.rejects(
    () => resetPasswordWithCode({ email, verificationCode: issued.debugCode, newPassword: "short" }),
    { status: 400 }
  );
  // 超长密码（bcrypt 72 字节上限）
  await assert.rejects(
    () =>
      resetPasswordWithCode({
        email,
        verificationCode: issued.debugCode,
        newPassword: "密".repeat(25),
      }),
    { status: 400 }
  );
  // 缺少字段
  await assert.rejects(() => resetPasswordWithCode({ email }), { status: 400 });

  // 邮箱未注册：与「验证码错误」同一结果，不泄漏存在性
  await assert.rejects(
    () =>
      resetPasswordWithCode({
        email: "never-registered@example.com",
        verificationCode: "123456",
        newPassword: "another-pw-123456",
      }),
    { status: 400, message: "邮箱验证码错误" }
  );

  // 正确的验证码只能用一次
  assert.deepEqual(
    await resetPasswordWithCode({
      email,
      verificationCode: issued.debugCode,
      newPassword: "another-pw-123456",
    }),
    { reset: true }
  );
  await assert.rejects(
    () =>
      resetPasswordWithCode({
        email,
        verificationCode: issued.debugCode,
        newPassword: "third-pw-123456",
      }),
    { status: 400 }
  );
});

test("reset codes are scoped to the reset purpose", async () => {
  const { email } = await createAccount("purpose-scope");

  const registerCode = await sendVerificationCode("register", email);
  const resetCode = await sendVerificationCode("reset", email);

  // 同一邮箱的两个用途互不覆盖
  assert.notEqual(registerCode.debugCode, undefined);
  assert.notEqual(resetCode.debugCode, undefined);

  // 拿注册验证码去重置密码必须失败
  await assert.rejects(
    () =>
      resetPasswordWithCode({
        email,
        verificationCode: registerCode.debugCode,
        newPassword: "stolen-pw-123456",
      }),
    { status: 400 }
  );

  // 重置验证码本身仍然可用（失败的尝试不应消耗它）
  assert.deepEqual(
    await resetPasswordWithCode({
      email,
      verificationCode: resetCode.debugCode,
      newPassword: "legit-pw-123456",
    }),
    { reset: true }
  );
});

test("changeOwnPassword requires the current password and keeps this device signed in", async () => {
  const { token } = await createAccount("change-own", "my-current-pw-123456");

  // 未登录
  await assert.rejects(
    () => changeOwnPassword(undefined, { currentPassword: "my-current-pw-123456", newPassword: "next-pw-123456" }),
    { status: 401 }
  );

  // 当前密码不对
  await assert.rejects(
    () => changeOwnPassword(token, { currentPassword: "wrong-password", newPassword: "next-pw-123456" }),
    { status: 400 }
  );

  // 缺少字段
  await assert.rejects(() => changeOwnPassword(token, { newPassword: "next-pw-123456" }), {
    status: 400,
  });

  // 新密码强度不足
  await assert.rejects(
    () => changeOwnPassword(token, { currentPassword: "my-current-pw-123456", newPassword: "short" }),
    { status: 400 }
  );

  // 正常修改
  const result = await changeOwnPassword(token, {
    currentPassword: "my-current-pw-123456",
    newPassword: "next-pw-123456",
  });
  assert.equal(result.changed, true);

  // 旧令牌失效（所有其他设备被踢下线）
  assert.equal(await getOptionalAuthSession(token), null);
  // 但补发的新令牌可用，当前设备不会被自己踢掉
  assert.ok(await getOptionalAuthSession(result.token));

  // 旧密码失效、新密码可用
  await assert.rejects(
    () => loginUser({ identifier: "change-own", password: "my-current-pw-123456" }),
    { status: 401 }
  );
  assert.equal(
    (await loginUser({ identifier: "change-own", password: "next-pw-123456" })).data.loggedIn,
    true
  );
});

test("failed password change does not alter the stored hash", async () => {
  const { email, password } = await createAccount("no-side-effect", "keep-me-pw-123456");
  const before = await prisma.user.findUnique({ where: { email }, select: { password: true } });

  const { token } = await loginUser({ identifier: email, password });
  await assert.rejects(
    () => changeOwnPassword(token, { currentPassword: "nope", newPassword: "unused-pw-123456" }),
    { status: 400 }
  );

  const after = await prisma.user.findUnique({ where: { email }, select: { password: true } });
  assert.equal(after?.password, before?.password, "失败的改密不应写入任何东西");
  // 原密码仍然可用
  assert.equal((await loginUser({ identifier: email, password })).data.loggedIn, true);
});
