import type { Metadata } from "next";
import ContentLayout from "@/components/public/layout/ContentLayout";
import { MessageIcon } from "@/components/public/layout/SiteIcons";

export const metadata: Metadata = {
  title: "留言",
  description: "博客留言板",
};

export default function MessagesPage() {
  return (
    <ContentLayout>
      <section className="surface-panel p-6 sm:p-10">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-pink-100 to-sky-100 text-sky-600 dark:from-purple-900/60 dark:to-sky-900/40 dark:text-sky-300">
            <MessageIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="section-kicker">Guestbook</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight">留言</h1>
          </div>
        </div>
        <div className="empty-state mt-8">独立留言板正在准备中，目前可以先在文章评论区交流。</div>
      </section>
    </ContentLayout>
  );
}
