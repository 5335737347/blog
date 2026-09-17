import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
import { MusicProvider } from "@/components/public/music/MusicToggle";
import { getOpenGraphImageUrl, getSiteUrl } from "@/lib/env";
import { getPublicSettings } from "@/lib/api/public-api";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, siteUrl, ogImage] = await Promise.all([
    getPublicSettings(),
    Promise.resolve(getSiteUrl()),
    Promise.resolve(getOpenGraphImageUrl()),
  ]);

  return {
    metadataBase: siteUrl ? new URL(siteUrl) : undefined,
    title: {
      default: settings.blogTitle,
      template: `%s | ${settings.blogTitle}`,
    },
    description: settings.blogDescription,
    // 这里刻意**不**声明 alternates：Next 的 metadata 是浅合并，页面导出的
    // `alternates`（写 canonical 时必然会有）会整体替换布局里的这一份——之前
    // RSS 自动发现链接就是这样在全站静默消失的。feed 声明现在由每个页面通过
    // `pageAlternates()` 统一产出（apps/web/src/lib/metadata.ts）。
    openGraph: {
      title: settings.blogTitle,
      description: settings.blogDescription,
      type: "website",
      locale: "zh_CN",
      siteName: settings.blogTitle,
      images: ogImage ? [{ url: ogImage, alt: settings.blogTitle }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: settings.blogTitle,
      description: settings.blogDescription,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col bg-bg text-ink antialiased">
        <ThemeProvider>
          <MusicProvider>
            {children}
          </MusicProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
