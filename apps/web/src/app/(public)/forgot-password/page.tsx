import type { Metadata } from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { getSiteUrl } from "@/lib/env";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  return {
    title: "重置密码",
    description: "通过邮箱验证码重置账号密码",
    alternates: { canonical: `${siteUrl}/forgot-password` },
    // 账号相关页面不应进入搜索引擎索引
    robots: { index: false, follow: false },
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
