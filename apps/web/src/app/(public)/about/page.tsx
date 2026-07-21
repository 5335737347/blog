import type { Metadata } from "next";
import ContentLayout from "@/components/public/layout/ContentLayout";
import { profile } from "@/config/profile";

export const metadata: Metadata = {
  title: "关于",
  description: "关于本站与作者",
};

export default function AboutPage() {
  return (
    <ContentLayout>
      <article className="surface-panel p-6 sm:p-10">
        <p className="section-kicker">About</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">关于这里</h1>
        {profile.bio ? (
          <p className="mt-6 whitespace-pre-line text-lg leading-9 text-[--muted]">{profile.bio}</p>
        ) : (
          <div className="empty-state mt-8">关于内容尚未添加。</div>
        )}
        {profile.socialLinks.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-3">
            {profile.socialLinks.map((link) => (
              <a key={link.href} href={link.href} className="secondary-link" target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        )}
      </article>
    </ContentLayout>
  );
}
