import crypto from "crypto";
import net from "net";
import tls from "tls";
import { getJwtSecret } from "@/lib/env";
import { normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/server/errors";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type VerificationChannel = "email" | "phone";
type VerificationPurpose = "register";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

interface SmsConfig {
  apiUrl: string;
  token: string;
  sender: string;
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function codeKey(channel: VerificationChannel, target: string, purpose: VerificationPurpose): string {
  return `${purpose}:${channel}:${target}`;
}

function codeHash(
  channel: VerificationChannel,
  target: string,
  purpose: VerificationPurpose,
  code: string
): string {
  return crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${purpose}:${channel}:${target}:${code}`)
    .digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function smtpConfig(): SmtpConfig | null {
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

function smsConfig(): SmsConfig | null {
  const apiUrl = process.env.SMS_API_URL?.trim();
  const token = process.env.SMS_API_TOKEN?.trim();
  const sender = process.env.SMS_SENDER?.trim() || "KpBlog";
  if (!apiUrl || !token) return null;

  try {
    const url = new URL(apiUrl);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw badRequest("生产环境短信网关必须使用 HTTPS");
    }
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) throw error;
    throw badRequest("短信网关地址配置不正确");
  }

  return { apiUrl, token, sender };
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

async function sendSmtpMail(to: string, subject: string, text: string) {
  const config = smtpConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw badRequest("邮箱服务未配置");
    }
    return false;
  }

  let socket = await connectSmtp(config);
  await readSmtpResponse(socket);
  let ehlo = await smtpCommand(socket, "EHLO localhost", [250]);
  socket = await maybeUpgradeStartTls(socket, config, ehlo);
  if (isTlsSocket(socket)) {
    ehlo = await smtpCommand(socket, "EHLO localhost", [250]);
  }
  void ehlo;

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
  socket.end();
  return true;
}

async function sendSms(phone: string, code: string) {
  const config = smsConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw badRequest("短信服务未配置");
    }
    return false;
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: phone,
      code,
      sender: config.sender,
      purpose: "register",
      message: `你的注册验证码是 ${code}，10 分钟内有效。`,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw badRequest("短信发送失败，请稍后重试");
  }
  return true;
}

export function normalizeVerificationTarget(
  channel: VerificationChannel,
  value: unknown
): string {
  if (channel === "email") {
    const email = normalizeEmail(value);
    if (!validEmail(email)) throw badRequest("请输入有效邮箱");
    return email;
  }

  const phone = normalizePhoneNumber(value);
  if (!phone) throw badRequest("请输入有效手机号");
  return phone;
}

export async function sendRegisterVerificationCode(
  channel: VerificationChannel,
  inputTarget: unknown
) {
  const target = normalizeVerificationTarget(channel, inputTarget);
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = Date.now() + CODE_TTL_MS;
  const sent = channel === "email"
    ? await sendSmtpMail(
        target,
        "注册验证码",
        `你的注册验证码是：${code}\n\n验证码 10 分钟内有效。如果不是你本人操作，请忽略这封邮件。`
      )
    : await sendSms(target, code);

  const key = codeKey(channel, target, "register");
  await prisma.verificationCode.upsert({
    where: { key },
    update: {
      hash: codeHash(channel, target, "register", code),
      expiresAt: new Date(expiresAt),
      attempts: 0,
    },
    create: {
      key,
      hash: codeHash(channel, target, "register", code),
      expiresAt: new Date(expiresAt),
    },
  });

  void prisma.verificationCode.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return {
    sent,
    channel,
    target,
    expiresAt: new Date(expiresAt).toISOString(),
    debugCode: sent ? undefined : code,
  };
}

export async function assertRegisterVerificationCode(
  channel: VerificationChannel,
  inputTarget: unknown,
  inputCode: unknown
) {
  const target = normalizeVerificationTarget(channel, inputTarget);
  const code = typeof inputCode === "string" ? inputCode.trim() : "";
  const key = codeKey(channel, target, "register");
  const entry = await prisma.verificationCode.findUnique({ where: { key } });
  const label = channel === "email" ? "邮箱" : "手机";

  if (!/^\d{6}$/.test(code) || !entry) {
    throw badRequest(`${label}验证码错误`);
  }
  if (entry.expiresAt.getTime() < Date.now()) {
    await prisma.verificationCode.delete({ where: { key } });
    throw badRequest(`${label}验证码已过期，请重新获取`);
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    await prisma.verificationCode.delete({ where: { key } });
    throw badRequest(`${label}验证码尝试次数过多，请重新获取`);
  }

  if (!timingSafeEqualHex(entry.hash, codeHash(channel, target, "register", code))) {
    await prisma.verificationCode.update({
      where: { key },
      data: { attempts: { increment: 1 } },
    });
    throw badRequest(`${label}验证码错误`);
  }

  await prisma.verificationCode.delete({ where: { key } });
}

export interface RegistrationCapabilities {
  email: boolean;
  phone: boolean;
}

export function getRegistrationCapabilities(): RegistrationCapabilities {
  const developmentFallback = process.env.NODE_ENV !== "production";
  return {
    email: developmentFallback || smtpConfig() !== null,
    phone: developmentFallback || smsConfig() !== null,
  };
}
