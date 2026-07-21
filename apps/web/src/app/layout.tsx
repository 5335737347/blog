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
    alternates: {
      types: { "application/rss+xml": "/rss.xml" },
    },
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
      <body className="flex min-h-screen flex-col bg-[--background] text-[--foreground] antialiased">
        <ThemeProvider>
          <MusicProvider>
            {children}
          </MusicProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
