"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import { ChevronLeftIcon } from "@/components/public/layout/SiteIcons";
import Input from "@/components/ui/Input";
import { readApiData, readApiError } from "@/lib/api-client";

interface RegisterResponse {
  loggedIn: boolean;
}

interface VerificationCodeResponse {
  sent: boolean;
  target: string;
  expiresAt: string;
  debugCode?: string;
}

export interface RegistrationCapabilities {
  email: boolean;
}

interface RegisterFormProps {
  initialCapabilities: RegistrationCapabilities;
}

export default function RegisterForm({ initialCapabilities }: RegisterFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [codeMessage, setCodeMessage] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [loading, setLoading] = useState(false);

  const registrationAvailable = initialCapabilities.email;

  const handleSendCode = async () => {
    setError("");
    setCodeMessage("");
    if (!registrationAvailable) {
      setError("注册服务暂未开放，请联系站点管理员。");
      return;
    }
    const target = email.trim();
    if (!target) {
      setError("请先填写邮箱");
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetch("/api/auth/verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "发送验证码失败"));
        return;
      }

      const data = await readApiData<VerificationCodeResponse>(res);
      setCodeMessage(
        data.debugCode
          ? `验证码已生成：${data.debugCode}`
          : "验证码已发送，请查收邮箱"
      );
    } catch {
      setError("网络错误");
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!registrationAvailable) {
      setError("当前没有可用的注册方式");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    if (!email.trim()) {
      setError("请填写注册邮箱");
      return;
    }
    if (!verificationCode.trim()) {
      setError("请填写验证码");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          displayName,
          email,
          verificationCode,
          password,
        }),
      });

      if (!res.ok) {
        setError(await readApiError(res, "注册失败"));
        return;
      }

      await readApiData<RegisterResponse>(res);
      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-2xl items-center px-5 py-12">
      <div className="w-full">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-meta text-ink-3 transition-colors hover:text-primary-deep"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            返回博客
          </Link>
          <p className="section-kicker mt-5">Create account</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">注册账号</h1>
          <p className="mt-2 text-ui leading-relaxed text-ink-2">
            填写以下信息，大约一分钟即可完成。注册后可以参与文章讨论。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          {error && (
            <p
              role="alert"
              className="rounded-sm bg-danger-soft px-4 py-3 text-meta text-danger sm:col-span-2"
            >
              {error}
            </p>
          )}
          <Input
            label="用户名"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            minLength={2}
            maxLength={32}
            required
            placeholder="2–32 个字符"
          />
          <Input
            label="昵称"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            maxLength={32}
            placeholder="选填，默认使用用户名"
          />
          <div className="sm:col-span-2">
            <Input
              label="注册邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="name@example.com"
              hint={!registrationAvailable ? "注册服务暂未开放，请联系站点管理员。" : undefined}
            />
          </div>
          <div className="sm:col-span-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Input
                label="邮箱验证码"
                type="text"
                inputMode="numeric"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                autoComplete="one-time-code"
                required
                placeholder="输入收到的验证码"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={sendingCode || loading || !registrationAvailable}
                onClick={handleSendCode}
                className="whitespace-nowrap"
              >
                {sendingCode ? "发送中..." : "发送验证码"}
              </Button>
            </div>
            {codeMessage && (
              <p
                role="status"
                aria-live="polite"
                className="mt-2 rounded-sm bg-accent-soft px-3 py-2 text-micro text-accent-deep"
              >
                {codeMessage}
              </p>
            )}
          </div>
          <Input
            label="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="至少 8 个字符"
            className="sm:col-span-2"
          />
          <Input
            label="确认密码"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="再次输入密码"
            className="sm:col-span-2"
          />
          <Button
            type="submit"
            size="lg"
            disabled={loading || !registrationAvailable}
            className="mt-1 w-full sm:col-span-2"
          >
            {loading ? "正在创建账号..." : "创建账号"}
          </Button>
        </form>

        <p className="mt-6 text-center text-meta text-ink-3">
          已有账号？{" "}
          <Link
            href="/login"
            className="text-ink-2 underline underline-offset-2 transition-colors hover:text-primary-deep"
          >
            直接登录
          </Link>
        </p>
      </div>
    </div>
  );
}
