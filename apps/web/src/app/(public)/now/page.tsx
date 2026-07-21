import type { Metadata } from "next";
import ContentLayout from "@/components/public/layout/ContentLayout";
import { profile } from "@/config/profile";

export const metadata: Metadata = { title: "近况", description: "最近正在做的事情" };

export default function NowPage() {
  return (
    <ContentLayout>
      <section className="surface-panel p-6 sm:p-10">
        <p className="section-kicker">Now</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">最近在做什么</h1>
        {profile.now ? (
          <p className="mt-6 whitespace-pre-line text-lg leading-9 text-[--muted]">{profile.now}</p>
        ) : (
          <div className="empty-state mt-8">近况内容尚未添加。</div>
        )}
      </section>
    </ContentLayout>
  );
}
