import assert from "node:assert/strict";
import net from "node:net";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/test-db";

const database = createTestDatabase("kpblog-smtp-test-");

interface FakeSmtp {
  port: number;
  commands: string[];
  close(): Promise<void>;
}

/**
 * 一个只说最低限度 SMTP 的假服务器：
 * 通告的能力由 advertiseStartTls 决定，并记录收到的全部命令。
 */
async function startFakeSmtp(options: {
  advertiseStartTls: boolean;
  /** 覆盖 AUTH 的应答码，用来模拟 Key 错误（535）。 */
  authCode?: string;
  /** 覆盖 MAIL FROM 的应答码，用来模拟发件域名未验证（550）。 */
  mailFromCode?: string;
}): Promise<FakeSmtp> {
  const commands: string[] = [];

  const server = net.createServer((socket) => {
    socket.write("220 fake.example ESMTP\r\n");
    let buffer = "";
    let inData = false;

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index: number;
      while ((index = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 queued\r\n");
          }
          continue;
        }

        commands.push(line);
        const upper = line.toUpperCase();

        if (upper.startsWith("EHLO")) {
          const caps = options.advertiseStartTls ? "250-STARTTLS\r\n" : "";
          socket.write(`250-fake.example\r\n${caps}250 AUTH PLAIN\r\n`);
        } else if (upper.startsWith("AUTH")) {
          socket.write(`${options.authCode ?? "235"} authenticated\r\n`);
        } else if (upper.startsWith("MAIL FROM")) {
          socket.write(`${options.mailFromCode ?? "250"} ok\r\n`);
        } else if (upper.startsWith("RCPT TO")) {
          socket.write("250 ok\r\n");
        } else if (upper.startsWith("DATA")) {
          inData = true;
          socket.write("354 end with .\r\n");
        } else if (upper.startsWith("QUIT")) {
          socket.write("221 bye\r\n");
          socket.end();
        } else {
          socket.write("250 ok\r\n");
        }
      }
    });
    socket.on("error", () => {});
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    port: address.port,
    commands,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function applySmtpEnv(port: number) {
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_SECURE = "false";
  delete process.env.SMTP_STARTTLS;
  process.env.SMTP_USER = "mailer@example.com";
  process.env.SMTP_PASSWORD = "smtp-password";
  process.env.SMTP_FROM = "mailer@example.com";
}

function clearSmtpEnv() {
  for (const key of [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_STARTTLS",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "SMTP_ALLOW_INSECURE",
  ]) {
    delete process.env[key];
  }
}

before(() => {
  // 不启用调试码：这里要验证的是真实的 SMTP 发送路径。
  delete process.env.ALLOW_DEBUG_VERIFICATION_CODE;
});

after(async () => {
  clearSmtpEnv();
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
  database.cleanup();
});

test("refuses to send SMTP credentials over an unencrypted connection", async () => {
  const smtp = await startFakeSmtp({ advertiseStartTls: false });
  applySmtpEnv(smtp.port);
  delete process.env.SMTP_ALLOW_INSECURE;

  const { sendVerificationCode } = await import(
    "../src/server/auth/verification-code-service"
  );

  await assert.rejects(
    () => sendVerificationCode("register", "reader@example.com"),
    /未加密/,
    "服务器未通告 STARTTLS 时必须拒绝发送凭据"
  );

  // 关键断言：客户端不能把 AUTH PLAIN 发出去（那会泄漏邮箱密码）。
  const authCommands = smtp.commands.filter((line) => line.toUpperCase().startsWith("AUTH"));
  assert.deepEqual(authCommands, [], `不应发送任何 AUTH 命令，实际收到: ${JSON.stringify(authCommands)}`);
  // 也不应发到 MAIL FROM 那一步
  assert.equal(
    smtp.commands.some((line) => line.toUpperCase().startsWith("MAIL FROM")),
    false
  );

  await smtp.close();
});

test("sends SMTP credentials in cleartext only when explicitly allowed", async () => {
  const smtp = await startFakeSmtp({ advertiseStartTls: false });
  applySmtpEnv(smtp.port);
  process.env.SMTP_ALLOW_INSECURE = "true";

  const { sendVerificationCode } = await import(
    "../src/server/auth/verification-code-service"
  );

  const result = await sendVerificationCode("register", "reader@example.com");
  assert.equal(result.sent, true);
  // 验证码已通过邮件发出，就不能再回显给调用方。
  assert.equal(result.debugCode, undefined);

  assert.ok(
    smtp.commands.some((line) => line.toUpperCase().startsWith("AUTH PLAIN")),
    "显式允许后应执行 AUTH PLAIN"
  );
  assert.ok(smtp.commands.some((line) => line.toUpperCase().startsWith("QUIT")));

  await smtp.close();
});

test("closes the socket even when a mid-session SMTP command fails", async () => {
  // 这个服务器在 RCPT TO 阶段报错，用于验证失败路径不会泄漏连接。
  const commands: string[] = [];
  let closed = false;
  const server = net.createServer((socket) => {
    socket.write("220 fake.example ESMTP\r\n");
    let buffer = "";
    let inData = false;
    socket.on("close", () => {
      closed = true;
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index: number;
      while ((index = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 queued\r\n");
          }
          continue;
        }
        commands.push(line);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO")) socket.write("250-fake.example\r\n250 AUTH PLAIN\r\n");
        else if (upper.startsWith("AUTH")) socket.write("235 ok\r\n");
        else if (upper.startsWith("MAIL FROM")) socket.write("250 ok\r\n");
        else if (upper.startsWith("RCPT TO")) socket.write("550 no such user\r\n");
        else if (upper.startsWith("DATA")) {
          inData = true;
          socket.write("354 go\r\n");
        } else socket.write("250 ok\r\n");
      }
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  applySmtpEnv(address.port);
  process.env.SMTP_ALLOW_INSECURE = "true";

  const { sendVerificationCode } = await import(
    "../src/server/auth/verification-code-service"
  );

  await assert.rejects(() => sendVerificationCode("register", "nobody@example.com"));

  // try/finally 必须关掉 socket，不能一直挂到 15 秒超时。
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(closed, true, "SMTP 命令失败后 socket 应被关闭");

  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// 诊断命令的价值全在「把三位数翻译成能照做的话」上：Key 错误和域名未验证
// 在协议层都只是一个状态码，分不出来就只能靠猜。
test("SMTP probe reports missing configuration without attempting a connection", async () => {
  clearSmtpEnv();
  const { probeSmtpConnection } = await import(
    "../src/server/auth/verification-code-service"
  );

  const steps = await probeSmtpConnection();
  assert.equal(steps.length, 1);
  assert.equal(steps[0].name, "配置");
  assert.equal(steps[0].ok, false);
});

test("SMTP probe pinpoints a rejected key and stops before MAIL FROM", async () => {
  const smtp = await startFakeSmtp({ advertiseStartTls: false, authCode: "535" });
  applySmtpEnv(smtp.port);
  process.env.SMTP_ALLOW_INSECURE = "true";

  const { probeSmtpConnection } = await import(
    "../src/server/auth/verification-code-service"
  );

  const steps = await probeSmtpConnection();
  const failed = steps.find((step) => !step.ok);
  assert.equal(failed?.name, "认证");
  assert.match(failed.detail, /535/);
  assert.match(failed.detail, /API Key/, "认证失败必须给出可执行的提示，而不是裸状态码");
  assert.equal(
    steps.some((step) => step.name === "发件人"),
    false,
    "认证没过就不该继续探测发件人"
  );

  await smtp.close();
});

test("SMTP probe explains a rejected sender as a domain verification problem", async () => {
  const smtp = await startFakeSmtp({ advertiseStartTls: false, mailFromCode: "550" });
  applySmtpEnv(smtp.port);
  process.env.SMTP_ALLOW_INSECURE = "true";

  const { probeSmtpConnection } = await import(
    "../src/server/auth/verification-code-service"
  );

  const steps = await probeSmtpConnection();
  const failed = steps.find((step) => !step.ok);
  assert.equal(failed?.name, "发件人");
  assert.match(failed.detail, /DNS 验证/);

  await smtp.close();
});

test("SMTP probe refuses to send credentials over a plaintext connection", async () => {
  const smtp = await startFakeSmtp({ advertiseStartTls: false });
  applySmtpEnv(smtp.port);
  delete process.env.SMTP_ALLOW_INSECURE;

  const { probeSmtpConnection } = await import(
    "../src/server/auth/verification-code-service"
  );

  const steps = await probeSmtpConnection();
  const failed = steps.find((step) => !step.ok);
  assert.equal(failed?.name, "传输安全");
  assert.deepEqual(
    smtp.commands.filter((line) => line.toUpperCase().startsWith("AUTH")),
    [],
    "未加密连接上诊断命令同样不能把凭据发出去"
  );

  await smtp.close();
});

test("SMTP probe walks the whole chain when everything is configured", async () => {
  const smtp = await startFakeSmtp({ advertiseStartTls: false });
  applySmtpEnv(smtp.port);
  process.env.SMTP_ALLOW_INSECURE = "true";

  const { probeSmtpConnection } = await import(
    "../src/server/auth/verification-code-service"
  );

  const steps = await probeSmtpConnection();
  assert.deepEqual(
    steps.map((step) => step.name),
    ["配置", "连接", "能力", "传输安全", "认证", "发件人"]
  );
  assert.ok(steps.every((step) => step.ok), "每一级都应通过");

  await smtp.close();
});
