import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/lib/theme";
import { MusicProvider } from "@/components/public/MusicToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: {
    default: "鲲鹏の博客 🌸",
    template: "%s | 鲲鹏の博客",
  },
  description: "🌸 一个 CS 学生的二次元技术博客 — 记录代码与 ACG 生活",
  icons: {
    icon: "/images/favicon.png",
    apple: "/images/favicon.png",
  },
  alternates: {
    types: { "application/rss+xml": "/rss.xml" },
  },
  openGraph: {
    title: "鲲鹏の博客 🌸",
    description: "一个 CS 学生的二次元技术博客",
    type: "website",
    locale: "zh_CN",
    siteName: "鲲鹏の博客",
    images: [{ url: "/images/og-image.png", width: 1200, height: 630, alt: "鲲鹏の博客" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col bg-[--background] text-[--foreground] antialiased">
        <Script id="theme-switch" strategy="beforeInteractive">
          {`try {
            var t = localStorage.getItem('theme');
            if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          } catch (e) {}`}
        </Script>
        <ThemeProvider>
          <MusicProvider>
            {children}
          </MusicProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
