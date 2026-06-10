import { cn } from "@/lib/utils";

export function NavIcon({
  name,
  active,
  className,
}: {
  name: string;
  active?: boolean;
  className?: string;
}) {
  const stroke = active ? "currentColor" : "currentColor";
  const c = cn("w-4 h-4 shrink-0", className);

  switch (name) {
    case "grid":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "search":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      );
    case "filter":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <path d="M3 5h18l-7 9v6l-4-2v-4z" strokeLinejoin="round" />
        </svg>
      );
    case "library":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <path d="M4 4h4v16H4zM10 4h4v16h-4z" />
          <path d="m17 5 3.5 1-4 14L13 19z" />
        </svg>
      );
    case "list":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
          <circle cx="3.5" cy="6" r="1" fill="currentColor" />
          <circle cx="3.5" cy="12" r="1" fill="currentColor" />
          <circle cx="3.5" cy="18" r="1" fill="currentColor" />
        </svg>
      );
    case "download":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <path d="M12 4v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 18v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
        </svg>
      );
    case "cpu":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
          <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" strokeLinecap="round" />
        </svg>
      );
    case "link":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1.5 1.5" strokeLinecap="round" />
          <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.5-1.5" strokeLinecap="round" />
        </svg>
      );
    case "gauge":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <path d="M4 14a8 8 0 1 1 16 0" strokeLinecap="round" />
          <path d="m12 14 4-4" strokeLinecap="round" />
          <circle cx="12" cy="14" r="1.25" fill="currentColor" />
        </svg>
      );
    case "gear":
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.75">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    default:
      return <span className={c} />;
  }
}
