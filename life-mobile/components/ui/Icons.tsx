import { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function makeIcon(children: React.ReactNode, filled = false) {
  return function Icon({ size = 20, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  };
}

/* ── Brand / Vitals ─────────────────────────────────────────── */

export const IconHeart = makeIcon(
  <path d="M12 20.5s-7.5-4.6-9.5-9.1C1.1 8 3 4.5 6.4 4.1c2-.2 3.8.9 4.9 2.4l.7 1 .7-1c1.1-1.5 2.9-2.6 4.9-2.4 3.4.4 5.3 3.9 3.9 7.3-2 4.5-9.5 9.1-9.5 9.1z" />,
  true
);

export const IconHeartOutline = makeIcon(
  <path d="M12 20.2s-7-4.3-8.9-8.5C1.8 8.6 3.6 5.4 6.7 5c1.9-.2 3.6.8 4.6 2.2l.7 1 .7-1c1-1.4 2.7-2.4 4.6-2.2 3.1.4 4.9 3.6 3.6 6.7-1.9 4.2-8.9 8.5-8.9 8.5z" />
);

export const IconActivity = makeIcon(
  <>
    <path d="M2.5 12h4l2.2-6.5 4.6 13 2.2-6.5h5.5" />
  </>
);

export const IconLungs = makeIcon(
  <>
    <path d="M12 3v9" />
    <path d="M12 12c-1.2-2.5-3-3.5-4.8-3.2-2.3.4-3.4 2.6-3.2 5.2.2 2.7 1.5 6.3 4 6.8 2 .4 4-1.3 4-4.4z" />
    <path d="M12 12c1.2-2.5 3-3.5 4.8-3.2 2.3.4 3.4 2.6 3.2 5.2-.2 2.7-1.5 6.3-4 6.8-2 .4-4-1.3-4-4.4z" />
  </>
);

/* ── Navigation ─────────────────────────────────────────────── */

export const IconMoon = makeIcon(
  <path d="M20.2 14.5A8.5 8.5 0 1 1 9.5 3.8a7 7 0 0 0 10.7 10.7z" />
);

export const IconChart = makeIcon(
  <>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </>
);

export const IconPerson = makeIcon(
  <>
    <circle cx="12" cy="7.5" r="3.5" />
    <path d="M4.5 20.5c.8-4 3.9-6.5 7.5-6.5s6.7 2.5 7.5 6.5" />
  </>
);

export const IconGrid = makeIcon(
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </>
);

/* ── Telemetry ──────────────────────────────────────────────── */

export const IconWave = makeIcon(
  <path d="M2.5 12c1.8 0 1.8-5 3.6-5s1.7 10 3.5 10 1.7-10 3.5-10 1.8 5 3.6 5 1.7-3 3.3-3" />
);

export const IconMic = makeIcon(
  <>
    <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3.5" />
  </>
);

export const IconBolt = makeIcon(
  <path d="M13 2.5L4.5 13.5H11L10 21.5l8.5-11H12l1-8z" />
);

export const IconMonitor = makeIcon(
  <>
    <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
    <path d="M8.5 21h7" />
    <path d="M12 17v4" />
  </>
);

export const IconDna = makeIcon(
  <>
    <path d="M5 3c0 6 14 6 14 12" />
    <path d="M19 3c0 6-14 6-14 12" />
    <path d="M5 21c0-1.5.9-2.7 2.2-3.6" />
    <path d="M19 21c0-1.5-.9-2.7-2.2-3.6" />
    <path d="M8 7.5h8" />
    <path d="M7 12h10" />
  </>
);

export const IconStop = makeIcon(
  <rect x="6" y="6" width="12" height="12" rx="2.5" />,
  true
);

/* ── Utility ────────────────────────────────────────────────── */

export const IconArrowRight = makeIcon(
  <>
    <path d="M4 12h16" />
    <path d="M14 6l6 6-6 6" />
  </>
);

export const IconChevronLeft = makeIcon(
  <path d="M15 5l-7 7 7 7" />
);

export const IconCheck = makeIcon(
  <path d="M4.5 12.5l5 5 10-11" />
);

export const IconLogout = makeIcon(
  <>
    <path d="M14.5 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6.5a2 2 0 0 0 2-2v-2" />
    <path d="M21 12H9.5" />
    <path d="M18 9l3 3-3 3" />
  </>
);

export const IconShield = makeIcon(
  <>
    <path d="M12 2.5l7.5 3v6c0 4.6-3.1 8.2-7.5 10-4.4-1.8-7.5-5.4-7.5-10v-6l7.5-3z" />
    <path d="M8.8 12l2.2 2.2 4.2-4.4" />
  </>
);

export const IconDownload = makeIcon(
  <>
    <path d="M12 3v13" />
    <path d="M7 11l5 5 5-5" />
    <path d="M3.5 17.5v2a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2" />
  </>
);

export const IconPrinter = makeIcon(
  <>
    <path d="M6 9V3h12v6" />
    <path d="M6 15H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="13" width="12" height="8" rx="1.5" />
  </>
);
