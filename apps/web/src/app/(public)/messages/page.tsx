import type { Metadata } from "next";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import CommentSection from "@/components/public/comments/CommentSection";
import { getSiteUrl } from "@/lib/env";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  return {
    title: "留言",
    description: "博客留言板",
    alternates: { canonical: siteUrl ? `${siteUrl}/messages` : undefined },
  };
}

export default function MessagesPage() {
  return (
    <PageShell narrow>
      <PageHeader
        kicker="Guestbook"
        title="留言"
        description="这里可以聊任何话题。留言需要审核后才会公开显示。"
      />
      {/* 不传 postId 即为留言板模式。 */}
      <CommentSection />
    </PageShell>
  );
}
