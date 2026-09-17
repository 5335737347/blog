import type { Metadata } from "next";
import { connection } from "next/server";
import RegisterForm from "./RegisterForm";
import { getRegistrationCapabilities } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  return {
    title: "注册",
    description: "注册账号后可以参与评论",
    alternates: { canonical: `${siteUrl}/register` },
    // 账号相关页面不应进入搜索引擎索引
    robots: { index: false, follow: false },
  };
}

export default async function RegisterPage() {
  await connection();
  return <RegisterForm initialCapabilities={await getRegistrationCapabilities()} />;
}
