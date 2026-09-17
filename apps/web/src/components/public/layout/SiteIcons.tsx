import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function KunFishIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      {/* 喷水 */}
      <path d="M19 9 C19 5.5 17 3 15 2 M24 9 C24 6 26 4 28 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* 上翘尾巴 */}
      <path d="M38 21 C41 15 44 12 47 13 C44 18 42 21 40 25 Z" fill="currentColor" />
      {/* 圆润身体 */}
      <path d="M40 24 C40 33 34 40 24 40 C13 40 5 34 5 25 C5 15 12 9 21 9 C30 9 38 14 40 24 Z" fill="currentColor" />
      {/* 眼睛 */}
      <circle cx="16" cy="20" r="2.8" fill="#1e293b" />
      <circle cx="17.1" cy="18.9" r="1" fill="white" />
      {/* 腮红 */}
      <circle cx="11.5" cy="27" r="2.6" fill="#f472b6" opacity="0.9" />
      {/* 微笑 */}
      <path d="M14 26 C15.5 28 18 29 20 28" stroke="#1e293b" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function ArticleIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3.75h7.5l3 3v13.5H6.75zM14.25 3.75v3h3M9.5 11h5M9.5 14.5h5" /></svg>;
}

export function ProfileIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}><circle cx="12" cy="8" r="3.25" /><path strokeLinecap="round" d="M5.5 19.25c.8-3.5 3-5.25 6.5-5.25s5.7 1.75 6.5 5.25" /></svg>;
}

export function MessageIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 5.25h15v10.5h-8l-4.75 3v-3H4.5z" /><path strokeLinecap="round" d="M8 9.25h8M8 12.25h5" /></svg>;
}

function Icon({ d, children, ...props }: IconProps & { d?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {d && <path d={d} />}
      {children}
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return <Icon {...props} d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />;
}

export function CalendarIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Icon>;
}

export function ClockIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Icon>;
}

export function TagIcon(props: IconProps) {
  return <Icon {...props}><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" /></Icon>;
}

export function CommentIcon(props: IconProps) {
  return <Icon {...props} d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />;
}

export function RssIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></Icon>;
}

export function SearchIcon(props: IconProps) {
  return <Icon {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>;
}

export function SunIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></Icon>;
}

export function MoonIcon(props: IconProps) {
  return <Icon {...props} d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />;
}

export function MonitorIcon(props: IconProps) {
  return <Icon {...props}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></Icon>;
}

export function ArrowUpIcon(props: IconProps) {
  return <Icon {...props} d="M12 19V5m-7 7 7-7 7 7" />;
}

export function MusicIcon(props: IconProps) {
  return <Icon {...props}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Icon>;
}

export function HomeIcon(props: IconProps) {
  return <Icon {...props}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></Icon>;
}

export function UserIcon(props: IconProps) {
  return <Icon {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>;
}

export function LockIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Icon>;
}

export function FileTextIcon(props: IconProps) {
  return <Icon {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></Icon>;
}

export function ChevronLeftIcon(props: IconProps) {
  return <Icon {...props} d="m15 18-6-6 6-6" />;
}

export function ChevronRightIcon(props: IconProps) {
  return <Icon {...props} d="m9 18 6-6-6-6" />;
}

export function ExternalLinkIcon(props: IconProps) {
  return <Icon {...props}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Icon>;
}

export function MailIcon(props: IconProps) {
  return <Icon {...props}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></Icon>;
}

export function ListIcon(props: IconProps) {
  return <Icon {...props}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></Icon>;
}

/* ===== 阅读器与交互补充 ===== */

export function CopyIcon(props: IconProps) {
  return <Icon {...props}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>;
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props} d="m20 6-11 11-5-5" />;
}

export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </Icon>
  );
}

export function HeartIcon(props: IconProps) {
  return <Icon {...props} d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 21.6l8.8-8.8a5.1 5.1 0 0 0 0-7.2Z" />;
}

export function CloseIcon(props: IconProps) {
  return <Icon {...props} d="M6 6l12 12M18 6 6 18" />;
}

export function MenuIcon(props: IconProps) {
  return <Icon {...props} d="M4 7h16M4 12h16M4 17h16" />;
}

export function ExpandIcon(props: IconProps) {
  return <Icon {...props}><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" /></Icon>;
}

export function SparkleIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></Icon>;
}

export function SproutIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 21V11" /><path d="M12 11c0-4 3-6 7-6 0 4-3 6-7 6Z" /><path d="M12 14c0-3-2.2-4.5-5.5-4.5C6.5 12.5 8.7 14 12 14Z" /></Icon>;
}

export function LayersIcon(props: IconProps) {
  return <Icon {...props}><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></Icon>;
}
