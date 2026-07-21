"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { readApiData, readApiError } from "@/lib/api-client";
import { COUNTRY_DIAL_OPTIONS, countryFlag, findCountryDialOption } from "@/lib/countries";
import { normalizePhoneNumber } from "@/lib/phone";

interface RegisterResponse {
  loggedIn: boolean;
}

type RegistrationMethod = "email" | "phone";

interface VerificationCodeResponse {
  sent: boolean;
  channel: RegistrationMethod;
  target: string;
  expiresAt: string;
  debugCode?: string;
}

interface CountryLocationResponse {
  countryCode: string;
  source: "ip" | "language" | "default";
}

export interface RegistrationCapabilities {
  email: boolean;
  phone: boolean;
}

interface RegisterFormProps {
  initialCapabilities: RegistrationCapabilities;
}

const REGISTRATION_OPTIONS = [
  { value: "email", label: "邮箱注册" },
  { value: "phone", label: "手机号注册" },
] as const;

export default function RegisterForm({ initialCapabilities }: RegisterFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("CN");
  const [registrationMethod, setRegistrationMethod] = useState<RegistrationMethod>(
    initialCapabilities.email ? "email" : "phone"
  );
  const [verificationCode, setVerificationCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [codeMessage, setCodeMessage] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const phoneCountryChanged = useRef(false);
  const selectedPhoneCountry = findCountryDialOption(phoneCountry) || COUNTRY_DIAL_OPTIONS[0];
  const fullPhone = phone.trim()
    ? normalizePhoneNumber(phone, selectedPhoneCountry.code) || ""
    : "";
  const registrationAvailable = initialCapabilities[registrationMethod];
  const registrationOptions = REGISTRATION_OPTIONS.filter(
    (option) => initialCapabilities[option.value]
  );

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/location/country", { signal: controller.signal })
      .then((response) => readApiData<CountryLocationResponse>(response))
      .then((location) => {
        if (!phoneCountryChanged.current && findCountryDialOption(location.countryCode)) {
          setPhoneCountry(location.countryCode);
        }
      })
      .catch(() => {
        // Keep the China default when geolocation headers are unavailable.
      });

    return () => controller.abort();
  }, []);

  const handleSendCode = async () => {
    setError("");
    setCodeMessage("");
    if (!registrationAvailable) {
      setError("当前注册方式尚未配置");
      return;
    }
    const target = registrationMethod === "email" ? email.trim() : fullPhone;
    if (!target) {
      setError(
        registrationMethod === "email"
          ? "请先填写邮箱"
          : phone.trim()
            ? "手机号格式不正确，请检查国家或地区"
            : "请先填写手机号"
      );
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetch("/api/auth/verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: registrationMethod, target }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "发送验证码失败"));
        return;
      }

      const data = await readApiData<VerificationCodeResponse>(res);
      setCodeMessage(
        data.debugCode
          ? `验证码已生成：${data.debugCode}`
          : registrationMethod === "email"
            ? "验证码已发送，请查收邮箱"
            : "验证码已发送，请查看手机短信"
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
    if (registrationMethod === "email" && !email.trim()) {
      setError("请填写注册邮箱");
      return;
    }
    if (registrationMethod === "phone" && !fullPhone) {
      setError(phone.trim() ? "手机号格式不正确，请检查国家或地区" : "请填写注册手机号");
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
          email: registrationMethod === "email" ? email : "",
          phone: registrationMethod === "phone" ? fullPhone : "",
          verificationChannel: registrationMethod,
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
    <section className="relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden px-4 py-10 sm:px-6 sm:py-14">
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(135deg,#ffffff_0%,#fff5f7_42%,#eef8ff_100%)] dark:bg-[linear-gradient(135deg,#151b2a_0%,#261f31_48%,#172b40_100%)]" />
      <div className="absolute -left-24 top-12 -z-10 h-72 w-72 rounded-full bg-pink-200/45 blur-3xl dark:bg-pink-500/10" />
      <div className="absolute -right-20 bottom-8 -z-10 h-80 w-80 rounded-full bg-sky-200/55 blur-3xl dark:bg-sky-500/10" />

      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/90 bg-white/90 shadow-[0_30px_90px_-48px_rgba(43,95,142,0.42)] backdrop-blur-xl dark:border-purple-800/60 dark:bg-[#1b2031]/95 md:grid-cols-[0.82fr_1.18fr]">
        <div className="relative hidden overflow-hidden bg-[linear-gradient(155deg,#ef5f7a_0%,#f78ca1_38%,#65b9ee_100%)] p-10 text-white md:flex md:flex-col md:justify-between">
          <div className="absolute -right-20 -top-16 h-64 w-64 rounded-full border-[42px] border-white/10" />
          <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />

          <div className="relative">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-2 text-xs font-semibold tracking-wide backdrop-blur-md transition-colors hover:bg-white/25"
            >
              <span aria-hidden="true">←</span>
              返回博客
            </Link>
            <p className="mt-16 text-xs font-bold uppercase tracking-[0.28em] text-white/75">
              Join the conversation
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-[-0.04em]">
              创建账号，
              <br />
              留下你的想法。
            </h1>
            <p className="mt-5 max-w-xs text-sm leading-7 text-white/80">
              注册后可以参与文章讨论，并在再次访问时保留你的身份。
            </p>
          </div>

        </div>

        <div className="p-6 sm:p-10 lg:p-12">
          <div className="mb-8">
            <Link href="/" className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-sky-700 hover:text-pink-600 dark:text-sky-300 md:hidden">
              <span aria-hidden="true">←</span>
              返回博客
            </Link>
            <p className="section-kicker">Create account</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-purple-950 dark:text-purple-50">
              注册账号
            </h2>
            <p className="mt-2 text-sm leading-6 text-[--muted]">
              填写以下信息，大约一分钟即可完成。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          {error && (
            <p role="alert" className="sm:col-span-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/25 dark:text-red-300">
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
            className="!border-sky-100 focus:!border-sky-400 focus:!ring-sky-100 dark:!border-purple-700"
          />
          <Input
            label="昵称"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            maxLength={32}
            placeholder="选填，默认使用用户名"
            className="!border-sky-100 focus:!border-sky-400 focus:!ring-sky-100 dark:!border-purple-700"
          />
          <div className="sm:col-span-2">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-purple-800 dark:text-purple-200">注册方式</legend>
              {registrationOptions.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                  注册服务暂未开放，请联系站点管理员。
                </p>
              ) : (
              <div className={`grid ${registrationOptions.length > 1 ? "grid-cols-2" : "grid-cols-1"} rounded-xl bg-sky-50 p-1 dark:bg-purple-900/35`}>
                {registrationOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={registrationMethod === option.value}
                    onClick={() => {
                      setRegistrationMethod(option.value);
                      setVerificationCode("");
                      setCodeMessage("");
                      setError("");
                    }}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                      registrationMethod === option.value
                        ? "bg-white text-pink-600 shadow-sm dark:bg-purple-800 dark:text-pink-300"
                        : "text-purple-500 hover:text-sky-700 dark:text-purple-400 dark:hover:text-sky-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              )}
            </fieldset>
          </div>
          {registrationMethod === "email" ? (
            <div className="sm:col-span-2">
              <Input
                label="注册邮箱"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="name@example.com"
                className="!border-sky-100 focus:!border-sky-400 focus:!ring-sky-100 dark:!border-purple-700"
              />
            </div>
          ) : (
            <div className="sm:col-span-2">
              <label htmlFor="register-phone" className="mb-1 block text-sm font-medium text-purple-800 dark:text-purple-200">
                注册手机号
              </label>
              <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[12rem_1fr]">
                <select
                  aria-label="国家或地区区号"
                  value={phoneCountry}
                  onChange={(event) => {
                    phoneCountryChanged.current = true;
                    setPhoneCountry(event.target.value);
                  }}
                  className="h-[42px] min-w-0 rounded-2xl border-2 border-sky-100 bg-white px-3 text-sm text-purple-950 outline-none transition-all focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-100"
                >
                  {COUNTRY_DIAL_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {countryFlag(country.code)} {country.name} {country.dialCode}
                    </option>
                  ))}
                </select>
                <Input
                  id="register-phone"
                  aria-label={`手机号，当前区号 ${selectedPhoneCountry.dialCode}`}
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel-national"
                  maxLength={24}
                  required
                  placeholder="请输入手机号"
                  className="!border-sky-100 focus:!border-sky-400 focus:!ring-sky-100 dark:!border-purple-700"
                />
              </div>
              <p className="mt-1.5 text-xs text-[--muted]">区号会自动定位，也可以手动选择。</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <Input
                  label={registrationMethod === "email" ? "邮箱验证码" : "手机验证码"}
                  type="text"
                  inputMode="numeric"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  autoComplete="one-time-code"
                  required
                  placeholder="输入收到的验证码"
                  className="!border-sky-100 focus:!border-sky-400 focus:!ring-sky-100 dark:!border-purple-700"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={sendingCode || loading || !registrationAvailable}
                onClick={handleSendCode}
                className="h-[42px] whitespace-nowrap !rounded-xl !border-sky-200 !text-sky-700 hover:!bg-sky-50 dark:!border-sky-800 dark:!text-sky-300"
              >
                {sendingCode ? "发送中..." : "发送验证码"}
              </Button>
            </div>
            {codeMessage && (
              <p role="status" aria-live="polite" className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-900/25 dark:text-sky-300">
                {codeMessage}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Input
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="至少 8 个字符"
              className="!border-sky-100 focus:!border-sky-400 focus:!ring-sky-100 dark:!border-purple-700"
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              label="确认密码"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="再次输入密码"
              className="!border-sky-100 focus:!border-sky-400 focus:!ring-sky-100 dark:!border-purple-700"
            />
          </div>
          <Button type="submit" size="lg" disabled={loading || !registrationAvailable} className="sm:col-span-2 mt-1 w-full !rounded-xl !bg-gradient-to-r !from-pink-500 !to-sky-500 shadow-lg shadow-pink-200/60 hover:!from-pink-600 hover:!to-sky-600 dark:shadow-none">
            {loading ? "正在创建账号..." : "创建账号"}
          </Button>
        </form>
          <p className="mt-6 text-center text-sm text-[--muted]">
            已有账号？{" "}
            <Link href="/login" className="font-semibold text-pink-600 transition-colors hover:text-sky-600 dark:text-pink-300">
              直接登录
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
