import type { Metadata } from "next";
import ContentLayout from "@/components/public/layout/ContentLayout";
import { profile } from "@/config/profile";

export const metadata: Metadata = { title: "相册", description: "照片与生活片段" };

export default function GalleryPage() {
  return (
    <ContentLayout>
      <section>
        <p className="section-kicker">Gallery</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">照片与片段</h1>
        {profile.gallery.length === 0 ? (
          <div className="empty-state mt-8">相册内容尚未添加。</div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {profile.gallery.map((item) => (
              <figure key={item.src} className="surface-panel overflow-hidden">
                {/* User-managed gallery sources are intentionally rendered without invented dimensions. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt={item.alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                {item.caption && <figcaption className="p-4 text-sm text-[--muted]">{item.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </section>
    </ContentLayout>
  );
}
