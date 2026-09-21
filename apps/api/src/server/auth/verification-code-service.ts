import crypto from "crypto";
import net from "net";
import tls from "tls";
import { getJwtSecret } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/server/errors";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 验证码用途。注册与重置密码共用同一套生成、投递、限流与校验机制，
 * 只用前缀区分，避免两套几乎相同的代码各自演化。
 *
 * 前缀不同还有一个安全作用：注册验证码无法被拿去重置密码，反之亦然。
 */
export type VerificationPurpose = "register" | "reset";

const MAIL_COPY: Record<VerificationPurpose, { subject: string; lead: string }> = {
  register: { subject: "注册验证码", lead: "你的注册验证码是" },
  reset: { subject: "重置密码验证码", lead: "你的重置密码验证码是" },
};

function codeKey(purpose: VerificationPurpose, target: string): string {
  return `${purpose}:email:${target}`;
}

function codeHash(purpose: VerificationPurpose, target: string, code: string): string {
  return crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${purpose}:email:${target}:${code}`)
    .digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** 导出仅供 scripts/smtp-check.ts 诊断使用；业务代码请走 sendSmtpMail。 */
export function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !password || !from) {
    return null;
  }

  const port = Number.parseInt(process.env.SMTP_PORT || "", 10);
  const secure =
    process.env.SMTP_SECURE === "true" ||
    (!process.env.SMTP_SECURE && (Number.isFinite(port) ? port : 465) === 465);

  return {
    host,
    port: Number.isFinite(port) ? port : secure ? 465 : 587,
    secure,
    user,
    password,
    from,
  };
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

function socketWrite(socket: net.Socket | tls.TLSSocket, data: string) {
  return new Promise<void>((resolve, reject) => {
    socket.write(data, (error) => (error ? reject(error) : resolve()));
  });
}

async function readSmtpResponse(socket: net.Socket | tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpCommand(
  socket: net.Socket | tls.TLSSocket,
  command: string,
  expected: number[]
): Promise<string> {
  await socketWrite(socket, `${command}\r\n`);
  const response = await readSmtpResponse(socket);
  const code = Number.parseInt(response.slice(0, 3), 10);
  if (!expected.includes(code)) {
    throw new Error(`SMTP command failed: ${code}`);
  }
  return response;
}

function connectSmtp(config: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    socket.setTimeout(15_000, () => socket.destroy(new Error("SMTP connection timed out")));
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

function isTlsSocket(socket: net.Socket | tls.TLSSocket): socket is tls.TLSSocket {
  return "encrypted" in socket;
}

async function maybeUpgradeStartTls(
  socket: net.Socket | tls.TLSSocket,
  config: SmtpConfig,
  ehloResponse: string
): Promise<net.Socket | tls.TLSSocket> {
  if (config.secure || process.env.SMTP_STARTTLS === "false" || !/STARTTLS/i.test(ehloResponse)) {
    return socket;
  }

  await smtpCommand(socket, "STARTTLS", [220]);
  return tls.connect({ socket, servername: config.host });
}

/**
 * 是否允许把验证码直接回显给调用方（仅用于本地开发没有 SMTP 的场景）。
 *
 * 之前用 `NODE_ENV !== "production"` 判断，一旦部署时漏设 NODE_ENV
 * （例如绕过 PM2 直接 `node dist/index.js`），接口就会把真实验证码返回给任何人，
 * 等于任何人都能完成任意邮箱的注册。改为必须显式开启，默认安全。
 */
function debugCodeAllowed(): boolean {
  return process.env.ALLOW_DEBUG_VERIFICATION_CODE === "true";
}

/**
 * Resend HTTPS API 发送。优先于 SMTP:API Key 与 SMTP 中继是两套独立凭据,
 * SMTP 需要在 Resend 控制台单独开启,而 API Key 天然可用(实测)。
 */
async function sendViaResendApi(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  text: string
): Promise<string | null> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Resend API ${response.status}: ${detail}`);
  }
  const payload = (await response.json()) as { id?: string };
  return payload.id ?? null;
}

async function sendMail(to: string, subject: string, text: string) {
  // RESEND_API_KEY 优先:同一家服务商,HTTPS API 无需开启 SMTP 中继。
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    const from = process.env.RESEND_FROM?.trim() || process.env.SMTP_FROM?.trim();
    if (!from) throw badRequest("缺少发件人地址（RESEND_FROM 或 SMTP_FROM）");
    const messageId = await sendViaResendApi(resendApiKey, from, to, subject, text);
    return { messageId };
  }

  const config = smtpConfig();
  if (!config) {
    if (debugCodeAllowed()) {
      return false;
    }
    throw badRequest("邮箱服务未配置");
  }

  let socket = await connectSmtp(config);
  try {
    await readSmtpResponse(socket);
    let ehlo = await smtpCommand(socket, "EHLO localhost", [250]);
    socket = await maybeUpgradeStartTls(socket, config, ehlo);
    if (isTlsSocket(socket)) {
      ehlo = await smtpCommand(socket, "EHLO localhost", [250]);
    }
    void ehlo;

    // 服务器未提供 STARTTLS 时，之前会继续在明文连接上发 AUTH PLAIN，
    // 等于把邮箱密码泄漏到网络上。除非显式允许（例如本机中继），否则拒绝。
    if (!isTlsSocket(socket) && process.env.SMTP_ALLOW_INSECURE !== "true") {
      throw new Error(
        "SMTP 连接未加密，拒绝发送凭据。请启用 SMTP_SECURE 或 STARTTLS；" +
          "若确实使用本机明文中继，请显式设置 SMTP_ALLOW_INSECURE=true。"
      );
    }

    const auth = Buffer.from(`\0${config.user}\0${config.password}`, "utf8").toString("base64");
    await smtpCommand(socket, `AUTH PLAIN ${auth}`, [235]);
    await smtpCommand(socket, `MAIL FROM:<${config.from}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    await socketWrite(
      socket,
      [
        `From: ${safeHeader(config.from)}`,
        `To: ${safeHeader(to)}`,
        `Subject: ${safeHeader(subject)}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "",
        text.replace(/\r?\n/g, "\r\n"),
        ".",
        "",
      ].join("\r\n")
    );
    await readSmtpResponse(socket);
    await smtpCommand(socket, "QUIT", [221]).catch(() => {});
    return true;
  } finally {
    // 任何一步失败都要关闭连接，否则 socket 会一直挂到 15 秒超时。
    socket.end();
  }
}

export function normalizeVerificationTarget(value: unknown): string {
  const email = normalizeEmail(value);
  if (!validEmail(email)) throw badRequest("请输入有效邮箱");
  return email;
}

export async function sendVerificationCode(
  purpose: VerificationPurpose,
  inputTarget: unknown
) {
  const target = normalizeVerificationTarget(inputTarget);
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = Date.now() + CODE_TTL_MS;
  const copy = MAIL_COPY[purpose];
  // 注意:SMTP 的原始错误(认证被拒、连接未加密等)从这里向上抛,
  // 由 auth 路由层统一翻译成 503;service 层保持语义,smtp.test.ts
  // 依赖这些具体错误(如「未加密」守卫)。
  const sent = await sendMail(
    target,
    copy.subject,
    `${copy.lead}：${code}\n\n验证码 10 分钟内有效。如果不是你本人操作，请忽略这封邮件。`
  );

  const key = codeKey(purpose, target);
  const hash = codeHash(purpose, target, code);
  await prisma.verificationCode.upsert({
    where: { key },
    update: {
      hash,
      expiresAt: new Date(expiresAt),
      attempts: 0,
    },
    create: {
      key,
      hash,
      expiresAt: new Date(expiresAt),
    },
  });

  // 清理过期验证码。必须捕获拒绝：未处理的 Promise 拒绝在 Node 默认策略下会终止进程。
  void prisma.verificationCode
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch((error) => {
      console.error("[verification-code] 清理过期验证码失败:", error);
    });

  return {
    sent,
    target,
    expiresAt: new Date(expiresAt).toISOString(),
    debugCode: debugCodeAllowed() && !sent ? code : undefined,
  };
}

export async function assertVerificationCode(
  purpose: VerificationPurpose,
  inputTarget: unknown,
  inputCode: unknown
) {
  const target = normalizeVerificationTarget(inputTarget);
  const code = typeof inputCode === "string" ? inputCode.trim() : "";
  const key = codeKey(purpose, target);
  const entry = await prisma.verificationCode.findUnique({ where: { key } });

  if (!/^\d{6}$/.test(code) || !entry) {
    throw badRequest("邮箱验证码错误");
  }
  if (entry.expiresAt.getTime() < Date.now()) {
    await prisma.verificationCode.delete({ where: { key } });
    throw badRequest("邮箱验证码已过期，请重新获取");
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    await prisma.verificationCode.delete({ where: { key } });
    throw badRequest("邮箱验证码尝试次数过多，请重新获取");
  }

  if (!timingSafeEqualHex(entry.hash, codeHash(purpose, target, code))) {
    await prisma.verificationCode.update({
      where: { key },
      data: { attempts: { increment: 1 } },
    });
    throw badRequest("邮箱验证码错误");
  }

  await prisma.verificationCode.delete({ where: { key } });
}

export function getRegistrationCapabilities(): { email: boolean } {
  return {
    // 只配 RESEND_API_KEY（没有 SMTP 变量）也算邮箱通道可用，
    // 否则注册页会在明明能发信的部署上隐藏邮箱注册入口。
    email:
      Boolean(process.env.RESEND_API_KEY?.trim()) || smtpConfig() !== null || debugCodeAllowed(),
  };
}

export interface SmtpProbeStep {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * 把 SMTP 裸状态码翻译成能照着做的提示。
 *
 * 协议层只会抛出 `SMTP command failed: 535` 这种句子——配置阶段真正卡人的是
 * 「Key 错」和「域名没验证」这两种完全不同的原因，却都表现为一个三位数。
 */
function smtpHint(code: number, stage: string): string {
  switch (code) {
    case 534:
    case 535:
      return "认证被拒：API Key 可能无效或已撤销，或 SMTP_PASSWORD 填的不是 Key。";
    case 550:
    case 553:
      return stage === "发件人"
        ? "发件人被拒：SMTP_FROM 的域名通常需要先在服务商完成 DNS 验证（SPF/DKIM）。"
        : "收件人被拒：确认地址拼写，且服务商允许发往该域名。";
    case 530:
    case 538:
      return "服务器要求先建立加密连接：检查 SMTP_SECURE / SMTP_STARTTLS / SMTP_PORT 是否配套。";
    case 421:
      return "服务端限流或暂时不可用，稍后重试。";
    default:
      return "服务端返回了非预期状态码。";
  }
}

function smtpFailure(error: unknown, stage: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = /SMTP command failed: (\d{3})/.exec(message);
  return match ? `${message} —— ${smtpHint(Number.parseInt(match[1], 10), stage)}` : message;
}

/**
 * 逐级探测 SMTP 配置，走到 MAIL FROM 为止（不发送正文）。
 *
 * 刻意复用 connectSmtp / smtpCommand / maybeUpgradeStartTls——诊断必须跑在
 * 生产同一条路径上。另写一份协议实现的话，「诊断通过但线上失败」就毫无意义。
 */
export async function probeSmtpConnection(): Promise<SmtpProbeStep[]> {
  const steps: SmtpProbeStep[] = [];
  const config = smtpConfig();

  if (!config) {
    steps.push({
      name: "配置",
      ok: false,
      detail: "SMTP_HOST / SMTP_USER / SMTP_PASSWORD 未配置完整",
    });
    return steps;
  }

  steps.push({
    name: "配置",
    ok: true,
    detail:
      `${config.host}:${config.port}` +
      `${config.secure ? "（隐式 TLS）" : "（明文，视服务器能力升级 STARTTLS）"}` +
      `　用户 ${config.user}　发件人 ${config.from}`,
  });

  let socket: net.Socket | tls.TLSSocket;
  try {
    socket = await connectSmtp(config);
  } catch (error) {
    steps.push({ name: "连接", ok: false, detail: smtpFailure(error, "连接") });
    return steps;
  }

  try {
    const banner = await readSmtpResponse(socket);
    steps.push({ name: "连接", ok: true, detail: banner.trim().split(/\r?\n/)[0] });

    let ehlo = await smtpCommand(socket, "EHLO localhost", [250]);
    socket = await maybeUpgradeStartTls(socket, config, ehlo);
    if (isTlsSocket(socket)) {
      ehlo = await smtpCommand(socket, "EHLO localhost", [250]);
    }
    steps.push({
      name: "能力",
      ok: true,
      detail: /STARTTLS/i.test(ehlo) ? "服务器通告 STARTTLS" : "服务器未通告 STARTTLS",
    });

    if (isTlsSocket(socket)) {
      steps.push({
        name: "传输安全",
        ok: true,
        detail: `${socket.getProtocol() ?? "TLS"} / ${socket.getCipher()?.name ?? "未知套件"}`,
      });
    } else if (process.env.SMTP_ALLOW_INSECURE === "true") {
      steps.push({ name: "传输安全", ok: true, detail: "明文（已显式允许 SMTP_ALLOW_INSECURE=true）" });
    } else {
      steps.push({ name: "传输安全", ok: false, detail: "连接未加密，已拒绝发送凭据" });
      return steps;
    }

    try {
      const auth = Buffer.from(`\0${config.user}\0${config.password}`, "utf8").toString("base64");
      await smtpCommand(socket, `AUTH PLAIN ${auth}`, [235]);
      steps.push({ name: "认证", ok: true, detail: "AUTH PLAIN 通过" });
    } catch (error) {
      steps.push({ name: "认证", ok: false, detail: smtpFailure(error, "认证") });
      return steps;
    }

    try {
      await smtpCommand(socket, `MAIL FROM:<${config.from}>`, [250]);
      steps.push({ name: "发件人", ok: true, detail: `${config.from} 被服务器接受` });
    } catch (error) {
      steps.push({ name: "发件人", ok: false, detail: smtpFailure(error, "发件人") });
      return steps;
    }

    await smtpCommand(socket, "QUIT", [221]).catch(() => {});
    return steps;
  } catch (error) {
    steps.push({ name: "会话", ok: false, detail: smtpFailure(error, "会话") });
    return steps;
  } finally {
    socket.end();
  }
}

/** 诊断用：真发一封测试邮件，走与生产完全相同的投递路径。 */
export async function sendTestEmail(to: string): Promise<void> {
  const target = normalizeVerificationTarget(to);
  await sendMail(
    target,
    "邮件投递连通性测试",
    "收到这封邮件说明本站的邮件投递已经配置成功。\n\n这是一封测试邮件，不需要回复。"
  );
}
