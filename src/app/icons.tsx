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

export const ListLayoutIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <circle cx="2.8" cy="4" r=".6" fill="currentColor" />
      <circle cx="2.8" cy="8" r=".6" fill="currentColor" />
      <circle cx="2.8" cy="12" r=".6" fill="currentColor" />
    </>,
    p,
  );

export const BoardLayoutIcon = (p?: IconProps) =>
  svg(
    <>
      <rect x="1.8" y="2.5" width="3.6" height="11" rx="1" />
      <rect x="6.2" y="2.5" width="3.6" height="7.5" rx="1" />
      <rect x="10.6" y="2.5" width="3.6" height="9.5" rx="1" />
    </>,
    p,
  );

export const CalendarLayoutIcon = (p?: IconProps) =>
  svg(
    <>
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M2 6.3h12M5.2 1.8v2.4M10.8 1.8v2.4M5 9h.01M8 9h.01M11 9h.01M5 11.5h.01M8 11.5h.01" />
    </>,
    p,
  );

export const ChevronUpIcon = (p?: IconProps) => svg(<path d="m4 10 4-4 4 4" />, { size: 14, ...p });
export const ChevronDownIcon = (p?: IconProps) => svg(<path d="m4 6 4 4 4-4" />, { size: 14, ...p });
export const CloseIcon = (p?: IconProps) => svg(<path d="m4 4 8 8M12 4l-8 8" />, { size: 14, ...p });
export const TrashIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M2.8 4.3h10.4M6.3 4.3V2.9a.9.9 0 0 1 .9-.9h1.6a.9.9 0 0 1 .9.9v1.4" />
      <path d="m4 4.3.7 8.6a1.2 1.2 0 0 0 1.2 1.1h4.2a1.2 1.2 0 0 0 1.2-1.1l.7-8.6M6.7 7v4.2M9.3 7v4.2" />
    </>,
    { size: 14, ...p },
  );

export const KeyboardIcon = (p?: IconProps) =>
  svg(
    <>
      <rect x="1.5" y="4" width="13" height="8.5" rx="1.6" />
      <path d="M4 6.8h.01M6.5 6.8h.01M9 6.8h.01M11.5 6.8h.01M5 9.7h6" />
    </>,
    p,
  );
export const SyncIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M13 6.2A5.2 5.2 0 0 0 3.6 4.5M3 9.8a5.2 5.2 0 0 0 9.4 1.7" />
      <path d="M3.4 2.3v2.4h2.4M12.6 13.7v-2.4h-2.4" />
    </>,
    p,
  );
export const KeyIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="5.2" cy="10.8" r="2.8" />
      <path d="m7.2 8.8 6-6M11.2 4.8l1.6 1.6M9.8 6.2l1.2 1.2" />
    </>,
    p,
  );
export const ResetIcon = (p?: IconProps) => svg(<path d="M5.5 3.5 2.8 6.2l2.7 2.7M3 6.2h6.3a3.7 3.7 0 0 1 0 7.4H7" />, { size: 11, ...p });
export const PencilIcon = (p?: IconProps) => svg(<path d="M10.8 2.7a1.6 1.6 0 0 1 2.3 2.3l-7.6 7.6-3 .7.7-3Z" />, { size: 13, ...p });
export const CheckCircleIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="m5.3 8.2 1.9 1.9 3.6-3.9" />
    </>,
    p,
  );
export const FlagIcon = (p?: IconProps) => svg(<path d="M3.5 14V2.5M3.5 3h8.2l-1.8 3 1.8 3H3.5" />, { size: 10, ...p });
export const ClockIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </>,
    { size: 11, ...p },
  );
export const PersonIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="5.5" r="2.7" />
      <path d="M2.8 14a5.2 5.2 0 0 1 10.4 0" />
    </>,
    { size: 11, ...p },
  );
export const SectionIcon = (p?: IconProps) => svg(<path d="M2.5 4h11M2.5 8h7M2.5 12h9" />, { size: 11, ...p });
export const SubtaskIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M4 2.5v6.5a2 2 0 0 0 2 2h4" />
      <circle cx="11.8" cy="11" r="1.8" />
      <circle cx="4" cy="2.5" r=".2" />
    </>,
    { size: 10, ...p },
  );
export const ImportIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M8 2.5v7.5M5 7.2 8 10.2l3-3" />
      <path d="M2.8 10.5v1.8a1.2 1.2 0 0 0 1.2 1.2h8a1.2 1.2 0 0 0 1.2-1.2v-1.8" />
    </>,
    p,
  );
export const RepeatIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M3 7.2V6a2.5 2.5 0 0 1 2.5-2.5h7.3M10.8 1.5l2 2-2 2" />
      <path d="M13 8.8V10a2.5 2.5 0 0 1-2.5 2.5H3.2M5.2 14.5l-2-2 2-2" />
    </>,
    { size: 10, ...p },
  );
export const MoonIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) =>
  svg(<path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6Z" fill={filled ? "currentColor" : "none"} />, { size: 14, ...p });
export const StarIcon = (p?: IconProps) => svg(<path d="m8 2.2 1.7 3.6 3.9.5-2.9 2.7.7 3.9L8 11l-3.4 1.9.7-3.9-2.9-2.7 3.9-.5Z" fill="currentColor" />, { size: 13, ...p });
export const SunIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.8v1.4M8 12.8v1.4M14.2 8h-1.4M3.2 8H1.8M12.4 3.6l-1 1M4.6 11.4l-1 1M12.4 12.4l-1-1M4.6 4.6l-1-1" />
    </>,
    { size: 13, ...p },
  );
export const ArrowRightIcon = (p?: IconProps) => svg(<path d="M3 8h10M9 4l4 4-4 4" />, { size: 13, ...p });
export const NoDateIcon = (p?: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="m3.8 12.2 8.4-8.4" />
    </>,
    { size: 13, ...p },
  );
export const WarningIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M7.1 2.6a1 1 0 0 1 1.8 0l5.4 9.8a1 1 0 0 1-.9 1.5H2.6a1 1 0 0 1-.9-1.5Z" />
      <path d="M8 6.2v3M8 11.4h.01" />
    </>,
    { size: 12, ...p },
  );

const ArrowIcon = (d: string) => (p?: IconProps) => svg(<path d={d} />, { size: 13, ...p });
export const EditIcon = (p?: IconProps) => PencilIcon({ size: 13, ...p });
export const ArchiveIcon = (p?: IconProps) =>
  svg(
    <>
      <rect x="2" y="3" width="12" height="3.2" rx="1" />
      <path d="M3.2 6.2v6.3a1.2 1.2 0 0 0 1.2 1.2h7.2a1.2 1.2 0 0 0 1.2-1.2V6.2M6.5 9h3" />
    </>,
    { size: 13, ...p },
  );
export const CopyIcon = (p?: IconProps) =>
  svg(
    <>
      <rect x="5.2" y="5.2" width="8.3" height="8.3" rx="1.6" />
      <path d="M10.8 5.2V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.9a1.2 1.2 0 0 0 1.2 1.2h1.5" />
    </>,
    { size: 13, ...p },
  );
export const LinkIcon = (p?: IconProps) =>
  svg(<path d="M6.8 9.2a2.8 2.8 0 0 0 4 0l2.1-2.1a2.8 2.8 0 0 0-4-4l-.9.9M9.2 6.8a2.8 2.8 0 0 0-4 0L3.1 8.9a2.8 2.8 0 0 0 4 4l.9-.9" />, { size: 13, ...p });
export const OpenIcon = (p?: IconProps) => svg(<path d="M9 2.5h4.5V7M13.3 2.7 7.5 8.5M11.5 9.5v2.8a1.2 1.2 0 0 1-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2V5.7a1.2 1.2 0 0 1 1.2-1.2h2.8" />, { size: 13, ...p });
export const UndoIcon = ArrowIcon("M5.5 3.5 2.8 6.2l2.7 2.7M3 6.2h6.3a3.7 3.7 0 0 1 0 7.4H7");
export const SkipIcon = ArrowIcon("M3 11.5a5 5 0 0 1 9.2-4.3M12.6 3.8v3.6H9");
export const UpIcon = ArrowIcon("M8 13V3M4 7l4-4 4 4");
export const DownIcon = ArrowIcon("M8 3v10M4 9l4 4 4-4");
export const LeftIcon = ArrowIcon("M13 8H3M7 4 3 8l4 4");
export const SubProjectIcon = ArrowIcon("M4 3v5.5a2 2 0 0 0 2 2h7M10 7.5l3 3-3 3");
export const StarOutlineIcon = (p?: IconProps) => svg(<path d="m8 2.2 1.7 3.6 3.9.5-2.9 2.7.7 3.9L8 11l-3.4 1.9.7-3.9-2.9-2.7 3.9-.5Z" />, { size: 13, ...p });

/** Menu icons by name, so menus never fall back to emoji or text glyphs. */
export const I = {
  edit: () => <EditIcon />,
  trash: () => <TrashIcon size={13} />,
  archive: () => <ArchiveIcon />,
  copy: () => <CopyIcon />,
  link: () => <LinkIcon />,
  open: () => <OpenIcon />,
  undo: () => <UndoIcon />,
  skip: () => <SkipIcon />,
  up: () => <UpIcon />,
  down: () => <DownIcon />,
  left: () => <LeftIcon />,
  right: () => <ArrowRightIcon />,
  inbox: () => <InboxIcon size={13} />,
  check: () => <CheckCircleIcon size={13} />,
  tags: () => <HashIcon size={13} />,
  star: () => <StarIcon />,
  starOutline: () => <StarOutlineIcon />,
  section: () => <SectionIcon size={13} />,
  plus: () => <PlusIcon size={13} />,
  folder: () => <FolderIcon size={13} />,
  sidebar: () => <SidebarIcon size={13} />,
  keyboard: () => <KeyboardIcon size={13} />,
  gear: () => <GearIcon size={13} />,
  list: () => <ListLayoutIcon size={13} />,
  board: () => <BoardLayoutIcon size={13} />,
  calendar: () => <CalendarLayoutIcon size={13} />,
  import: () => <ImportIcon size={13} />,
  flag: () => <FlagIcon size={12} />,
  subProject: () => <SubProjectIcon />,
  productivity: () => <CheckCircleIcon size={13} />,
};
export const DatabaseIcon = (p?: IconProps) =>
  svg(
    <>
      <ellipse cx="8" cy="3.8" rx="5.2" ry="1.9" />
      <path d="M2.8 3.8v8.4c0 1 2.3 1.9 5.2 1.9s5.2-.9 5.2-1.9V3.8M2.8 8c0 1 2.3 1.9 5.2 1.9s5.2-.9 5.2-1.9" />
    </>,
    { size: 18, ...p },
  );
export const BoltIcon = (p?: IconProps) => svg(<path d="M9 1.8 3.5 9.2h4l-1 5 5.5-7.4h-4Z" />, { size: 18, ...p });
export const PageIcon = (p?: IconProps) =>
  svg(
    <>
      <path d="M4 1.8h5.5L12.5 5v8a1.2 1.2 0 0 1-1.2 1.2H4.7A1.2 1.2 0 0 1 3.5 13V3a1.2 1.2 0 0 1 .5-1.2Z" />
      <path d="M9.3 1.8V5h3.2M5.8 8.2h4.4M5.8 10.8h3" />
    </>,
    { size: 15, ...p },
  );
