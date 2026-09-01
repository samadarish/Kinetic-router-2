import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;
function StrokeIcon({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export function ArrowRightIcon(props: IconProps) { return <StrokeIcon {...props}><path d="M5 12h14M13 6l6 6-6 6" /></StrokeIcon>; }
export function CheckIcon(props: IconProps) { return <StrokeIcon {...props}><path d="m5 12 4 4L19 6" /></StrokeIcon>; }
export function ChevronDownIcon(props: IconProps) { return <StrokeIcon {...props}><path d="m6 9 6 6 6-6" /></StrokeIcon>; }
export function ClipboardIcon(props: IconProps) { return <StrokeIcon {...props}><rect x="7" y="5" width="12" height="15" rx="2" /><path d="M9 5V3h6v2M5 8H3v12h11" /></StrokeIcon>; }
export function CloseIcon(props: IconProps) { return <StrokeIcon {...props}><path d="m6 6 12 12M18 6 6 18" /></StrokeIcon>; }
export function ExternalIcon(props: IconProps) { return <StrokeIcon {...props}><path d="M14 5h5v5M10 14 19 5M19 13v6H5V5h6" /></StrokeIcon>; }
export function FilterIcon(props: IconProps) { return <StrokeIcon {...props}><path d="M4 6h16M7 12h10M10 18h4" /></StrokeIcon>; }
export function MenuIcon(props: IconProps) { return <StrokeIcon {...props}><path d="M4 7h16M4 12h16M4 17h16" /></StrokeIcon>; }
export function MoonIcon(props: IconProps) { return <StrokeIcon {...props}><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></StrokeIcon>; }
export function SearchIcon(props: IconProps) { return <StrokeIcon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></StrokeIcon>; }
export function SparklesIcon(props: IconProps) { return <StrokeIcon {...props}><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14ZM19 13l.7 1.8 1.8.7-1.8.7L19 18l-.7-1.8-1.8-.7 1.8-.7L19 13Z" /></StrokeIcon>; }
export function SunIcon(props: IconProps) { return <StrokeIcon {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></StrokeIcon>; }
