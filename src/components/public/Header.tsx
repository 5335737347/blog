import Link from "next/link";
import ThemeSelector from "./ThemeSelector";
import EffectsToggle from "./EffectsToggle";
import MusicToggle from "./MusicToggle";
import MusicPlayer from "./MusicPlayer";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md dark:bg-purple-950/90">
      <div className="mx-auto max-w-[90rem] px-4">
        <div className="flex items-center justify-between rounded-b-2xl border-x border-b border-pink-100 bg-white px-6 py-3 shadow-sm dark:border-purple-800/30 dark:bg-purple-950">
          <Link
            href="/"
            className="group flex items-center gap-2 text-xl font-bold transition-colors"
          >
            <span className="text-2xl animate-float">🌸</span>
            <span className="bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent group-hover:from-pink-600 group-hover:to-purple-600 dark:from-pink-400 dark:to-purple-400">
              鲲鹏の博客
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <div className="relative">
              <MusicToggle />
              <MusicPlayer />
            </div>
            <EffectsToggle />
            <ThemeSelector />
          </nav>
        </div>
      </div>
    </header>
  );
}
