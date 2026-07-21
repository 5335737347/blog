import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function KunFishIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4.8 27.1c5.7-9.8 14.4-15 25.2-13.4 5.7.9 9.4 4.1 11.1 8.7l5.2-4.5c.1 6.7-1.5 11.7-5.4 15.2-3.3 7.1-11.6 10.2-20.4 7.6C12.3 38.3 6.7 33.5 4.8 27.1Z"
        fill="currentColor"
      />
      <path d="M10.4 27c5.7 2.1 11.6 2.2 17.7.3-3.9 4.5-9.5 6.7-15.4 5.8" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity=".88" />
      <circle cx="31.6" cy="20.9" r="1.7" fill="white" />
      <path d="M23.5 13.3c2.1-4.1 5.7-6.2 10.7-6.5-2.3 3.8-5.6 6.2-10.7 6.5Z" fill="currentColor" opacity=".72" />
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

export function GalleryIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}><rect x="3.75" y="4.25" width="16.5" height="15.5" rx="2" /><circle cx="9" cy="9" r="1.4" /><path strokeLinecap="round" strokeLinejoin="round" d="m5.5 17 4.25-4 2.75 2.25 2.1-2 3.9 3.75" /></svg>;
}
