import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-verification-race-test-");

let sendVerificationCode: typeof import("../src/server/auth/verification-code-service").sendVerificationCode;
let assertVerificationCode: typeof import("../src/server/auth/verification-code-service").assertVerificationCode;

before(async () => {
  ({ sendVerificationCode, assertVerificationCode } = await import(
    "../src/server/auth/verification-code-service"
  ));
});

after(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

test("concurrent wrong guesses cannot claim more than MAX_ATTEMPTS", async () => {
  const email = "race-target@example.com";
  const issued = await sendVerificationCode("register", email);
  assert.match(issued.debugCode || "", /^\d{6}$/);
  const actualCode = issued.debugCode as string;

  // 10 个保证不同于真实验证码的猜测并发提交。
  const wrongCodes = Array.from({ length: 20 }, (_, index) =>
    String(100000 + index)
  )
    .filter((code) => code !== actualCode)
    .slice(0, 10);

  const outcomes = await Promise.all(
    wrongCodes.map(async (code) => {
      try {
        await assertVerificationCode("register", email, code);
        return "ok";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })
  );

  // 旧实现允许所有并发请求在 attempts=0 时进入哈希比较；新实现的原子条件
  // 更新最多只放行 MAX_ATTEMPTS 次，其余请求直接收到「尝试次数过多」。
  assert.equal(
    outcomes.filter((outcome) => outcome === "邮箱验证码错误").length,
    5,
    `恰好 5 个请求应真正参与比较：${JSON.stringify(outcomes)}`
  );
  assert.equal(
    outcomes.filter((outcome) => /尝试次数过多/.test(outcome)).length,
    5,
    `其余 5 个请求应直接拿到次数过多：${JSON.stringify(outcomes)}`
  );

  // 名额用满后真实验证码也不能再使用；重新发送会重置 attempts。
  await assert.rejects(
    () => assertVerificationCode("register", email, actualCode),
    { status: 400 }
  );
  const reissued = await sendVerificationCode("register", email);
  await assertVerificationCode("register", email, reissued.debugCode as string);
});
