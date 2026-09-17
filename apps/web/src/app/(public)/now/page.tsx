import type { Metadata } from "next";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getProfile } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  return {
    title: "近况",
    description: "最近正在做的事情",
    alternates: { canonical: `${siteUrl}/now` },
  };
}

export default async function NowPage() {
  const profile = await getProfile();
  const paragraphs = profile.now
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <PageShell narrow>
      <PageHeader
        kicker="Now"
        title="最近在做什么"
        description="这一页记录当下在学、在做、在玩的东西，会不定期更新。"
      />
      {paragraphs.length > 0 ? (
        <div className="reading">
          {paragraphs.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      ) : (
        <div className="empty-state">近况内容尚未添加。</div>
      )}
    </PageShell>
  );
}
