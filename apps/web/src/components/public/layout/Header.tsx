import Link from "next/link";
import ThemeSelector from "@/components/public/preferences/ThemeSelector";
import MusicToggle from "@/components/public/music/MusicToggle";
import MusicPlayer from "@/components/public/music/MusicPlayer";
import AuthNav from "@/components/public/auth/AuthNav";
import MobileNavigation from "./MobileNavigation";
import { ArticleIcon, GalleryIcon, KunFishIcon, MessageIcon, ProfileIcon } from "./SiteIcons";

const navigation = [
  { href: "/articles", label: "文章", icon: ArticleIcon },
  { href: "/about", label: "个人介绍", icon: ProfileIcon },
  { href: "/messages", label: "留言", icon: MessageIcon },
];

export default function Header({ blogTitle }: { blogTitle: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-sky-100/80 bg-white/92 backdrop-blur-xl dark:border-purple-800/50 dark:bg-[#151b2a]/92">
      <div className="relative mx-auto flex h-16 max-w-[92rem] items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label={`${blogTitle}主页`} className="group flex min-w-0 items-center gap-2.5 font-extrabold tracking-tight">
          <span className="grid h-11 w-11 shrink-0 place-items-center text-sky-500 transition group-hover:-translate-y-0.5 group-hover:text-pink-500 dark:text-sky-300 dark:group-hover:text-pink-300">
            <KunFishIcon className="h-11 w-11" />
          </span>
          <span className="hidden truncate bg-gradient-to-r from-pink-600 to-sky-600 bg-clip-text text-lg text-transparent dark:from-pink-300 dark:to-sky-300 sm:block">
            {blogTitle}
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-0.5 lg:flex" aria-label="主导航">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="nav-link flex items-center gap-1.5">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-0.5 lg:ml-2">
          <Link href="/gallery" aria-label="相册" title="相册" className="icon-button">
            <GalleryIcon className="h-5 w-5" />
          </Link>
          <div className="relative">
            <MusicToggle />
            <MusicPlayer />
          </div>
          <ThemeSelector />
          <div className="ml-1 hidden border-l border-sky-100 pl-2 xl:block dark:border-purple-800/50">
            <AuthNav />
          </div>
          <MobileNavigation />
        </div>
      </div>
    </header>
  );
}
