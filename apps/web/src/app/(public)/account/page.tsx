import type { Metadata } from "next";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import AccountForm from "./AccountForm";
import { getSiteUrl } from "@/lib/env";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  return {
    title: "账号设置",
    description: "管理你的账号与密码",
    alternates: { canonical: `${siteUrl}/account` },
    // 账号相关页面不应进入搜索引擎索引
    robots: { index: false, follow: false },
  };
}

export default function AccountPage() {
  return (
    <PageShell narrow>
      <PageHeader kicker="Account" title="账号设置" />
      <AccountForm />
    </PageShell>
  );
}
