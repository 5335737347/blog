#!/usr/bin/env node
/**
 * SMTP 配置诊断。
 *
 *   npm run smtp:check
 *   npm run smtp:check -- --send you@example.com
 *
 * 逐级验证「配置 → 连接 → 能力 → 传输安全 → 认证 → 发件人」，失败就停在那一步
 * 并给出可执行的提示。全部通过只说明 MAIL FROM 被接受；要确认邮件真的能落地
 * （而不是进了垃圾箱），用 --send 真发一封。
 */
import "../src/bootstrap-env";
import {
  probeSmtpConnection,
  sendTestEmail,
} from "../src/server/auth/verification-code-service";

const args = process.argv.slice(2);
const sendIndex = args.indexOf("--send");
const sendTo = sendIndex !== -1 ? args[sendIndex + 1] : undefined;

if (sendIndex !== -1 && !sendTo) {
  console.error("用法：npm run smtp:check -- --send you@example.com");
  process.exit(1);
}

function line(ok: boolean, name: string, detail: string) {
  const mark = ok ? "✅" : "❌";
  console.log(`  ${mark} ${name.padEnd(6, "　")} ${detail}`);
}

console.log("\nSMTP 配置诊断\n");

const steps = await probeSmtpConnection();
for (const step of steps) {
  line(step.ok, step.name, step.detail);
}

const failed = steps.find((step) => !step.ok);
console.log("");

if (failed) {
  console.log(`结论：在「${failed.name}」这一步失败，邮箱注册与密码重置目前不可用。`);
} else {
  console.log("结论：SMTP 链路可用（已确认到 MAIL FROM 被接受）。");
  if (!sendTo) {
    console.log("提示：加 --send you@example.com 可以真发一封，确认能投递而不是进垃圾箱。");
  }
}

// debug 回退会让 /api/auth/registration-options 在 SMTP 完全没配好的情况下
// 也报告「邮箱可用」。这个提示是为了避免拿着那个 true 当成 SMTP 验证通过。
if (process.env.ALLOW_DEBUG_VERIFICATION_CODE === "true") {
  console.log(
    "\n⚠️  ALLOW_DEBUG_VERIFICATION_CODE=true：验证码会直接回显在接口响应里，\n" +
      "    且注册接口无论 SMTP 是否可用都会报告邮箱通道可用。\n" +
      "    本地调试可以，生产环境必须关闭。"
  );
}

if (sendTo) {
  if (failed) {
    console.log("\n跳过发送测试：链路尚未打通。");
    process.exit(1);
  }
  process.stdout.write(`\n正在向 ${sendTo} 发送测试邮件 ... `);
  try {
    await sendTestEmail(sendTo);
    console.log("已提交");
    console.log("请检查收件箱（以及垃圾邮件目录）。");
  } catch (error) {
    console.log("失败");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

process.exit(failed ? 1 : 0);
