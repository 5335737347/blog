import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import { getSiteUrl } from "@/lib/env";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  return {
    title: "登录",
    description: "登录后可以参与评论",
    alternates: { canonical: `${siteUrl}/login` },
    // 账号相关页面不应进入搜索引擎索引
    robots: { index: false, follow: false },
  };
}

export default function LoginPage() {
  return <LoginForm />;
}
