/**
 * Line icons in the style of SF Symbols, so the chrome reads as a Mac app rather than a web page.
 * All draw with currentColor at 1.5px so they tint with the row they sit in.
 */
type IconProps = { size?: number; className?: string };

const svg = (path: React.ReactNode, { size = 16, className }: IconProps = {}) => (
  <svg
    className={`ico ${className ?? ""}`}
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {path}
  </svg>
);

export const InboxIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M2 9.5 3.6 3.6A1.2 1.2 0 0 1 4.8 2.7h6.4a1.2 1.2 0 0 1 1.2.9L14 9.5" />
      <path d="M2 9.5v2.8A1.2 1.2 0 0 0 3.2 13.5h9.6a1.2 1.2 0 0 0 1.2-1.2V9.5h-3.3a2.5 2.5 0 0 1-5 0Z" />
    </>,
    p,
  );

/** Calendar page showing today's date, like Todoist's and Things' Today icon. */
export const TodayIcon = (p?: IconProps) =>
  svg(
    <>
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M2 6.3h12M5.2 1.8v2.4M10.8 1.8v2.4" />
      <text x="8" y="12.3" textAnchor="middle" fontSize="5.4" fontWeight="700" fill="currentColor" stroke="none" fontFamily="-apple-system, sans-serif">
        {new Date().getDate()}
      </text>
    </>,
    p,
  );

export const UpcomingIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M8.2 14H3.6A1.6 1.6 0 0 1 2 12.4V4.6A1.6 1.6 0 0 1 3.6 3h8.8A1.6 1.6 0 0 1 14 4.6v2.6" />
      <path d="M2 6.3h12M5.2 1.8v2.4M10.8 1.8v2.4" />
      <circle cx="11.6" cy="11.6" r="3" />
      <path d="M11.6 10.3v1.4l.9.7" />
    </>,
    p,
  );

export const HashIcon = (p?: IconProps) => svg(<path d="M6 2.5 4.8 13.5M11.2 2.5 10 13.5M2.8 6h11M2.2 10.2h11" />, p);

export const FolderIcon = (p?: IconProps) =>
  svg(<path d="M1.8 4.4A1.4 1.4 0 0 1 3.2 3h3l1.5 1.6h5.1a1.4 1.4 0 0 1 1.4 1.4v6.1a1.4 1.4 0 0 1-1.4 1.4H3.2a1.4 1.4 0 0 1-1.4-1.4Z" />, p);

export const FilterIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M5 6.3h6M6 8.3h4M7 10.3h2" />
    </>,
    p,
  );

export const ChevronIcon = (p?: IconProps) => svg(<path d="m6 4 4 4-4 4" />, { size: 10, ...p });

export const SidebarIcon = (p?: IconProps) =>
  svg(
    <>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2.2" />
      <path d="M6.2 2.8v10.4M3.6 5.4h1M3.6 7.2h1" />
    </>,
    p,
  );

export const PlusIcon = (p?: IconProps) => svg(<path d="M8 3v10M3 8h10" />, p);

export const SearchIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="7" cy="7" r="4.3" />
      <path d="m10.2 10.2 3.3 3.3" />
    </>,
    p,
  );

export const GearIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
      <circle cx="8" cy="8" r="4.6" />
    </>,
    p,
  );

export const HelpIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.3 6.3a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.3" />
      <circle cx="8" cy="11.4" r=".35" fill="currentColor" />
    </>,
    p,
  );

export const DisplayIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
      <circle cx="5.5" cy="4.5" r="1.3" fill="var(--bg-fill, transparent)" />
      <circle cx="10.5" cy="8" r="1.3" fill="var(--bg-fill, transparent)" />
      <circle cx="6.5" cy="11.5" r="1.3" fill="var(--bg-fill, transparent)" />
    </>,
    p,
  );

export const BackIcon = (p?: IconProps) => svg(<path d="m10 3-5 5 5 5" />, p);
export const ForwardIcon = (p?: IconProps) => svg(<path d="m6 3 5 5-5 5" />, p);
export const CalendarSmallIcon = (p?: IconProps) =>
  svg(
    <>
      <rect x="2.2" y="3" width="11.6" height="10.8" rx="1.8" />
      <path d="M2.2 6.3h11.6M5.2 1.8v2.4M10.8 1.8v2.4" />
    </>,
    { size: 11, ...p },
  );
