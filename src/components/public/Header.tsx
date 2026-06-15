import Link from "next/link";
import ThemeSelector from "./ThemeSelector";
import EffectsToggle from "./EffectsToggle";
import MusicToggle from "./MusicToggle";
import MusicPlayer from "./MusicPlayer";

export default function Header() {
  return (
    <header className="border-b border-pink-100 bg-white dark:border-purple-800/30 dark:bg-purple-950">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4">
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
    </header>
  );
}
