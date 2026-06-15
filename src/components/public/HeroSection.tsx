import { getSettings } from "@/lib/prisma";

export default async function HeroSection() {
  const settingsMap = await getSettings();
  const blogTitle = settingsMap.blog_title || "鲲鹏の博客";

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-pink-100 via-purple-50 to-sky-100 dark:from-purple-950 dark:via-pink-950/30 dark:to-purple-950" />
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(167,139,250,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-pink-300/20 blur-3xl dark:bg-pink-500/10" />
      <div className="absolute -right-16 top-16 h-72 w-72 rounded-full bg-purple-300/20 blur-3xl dark:bg-purple-500/10" />
      <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />

      <div className="relative mx-auto max-w-[90rem] px-4 py-20 text-center">
        <div className="mb-4 text-5xl animate-float">🌸</div>
        <h1 className="text-5xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-sky-400 bg-clip-text text-transparent">
            {blogTitle}
          </span>
        </h1>
      </div>
    </section>
  );
}
