import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import { pageAlternates } from "@/lib/metadata";

export function generateMetadata(): Metadata {
  return {
    title: "登录",
    description: "登录后可以参与评论",
    alternates: pageAlternates("/login"),
    // 账号相关页面不应进入搜索引擎索引
    robots: { index: false, follow: false },
  };
}

export default function LoginPage() {
  return <LoginForm />;
}
