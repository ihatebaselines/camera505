'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import {
  IconGrid,
  IconMoon,
  IconChart,
  IconPerson,
  IconHeart,
  IconLogout,
} from '@/components/ui/Icons';
import { SmoothScroll } from '@/components/ui/Parallax';
import StudioLaunchButton from '@/components/StudioLaunchButton';
import { getProfile, removeNamespacedItem } from '@/lib/userStorage';

const NAV_ITEMS = [
  { label: 'Overview', icon: IconGrid, href: '/dashboard' },
  { label: 'Night', icon: IconMoon, href: '/dashboard/night' },
  { label: 'History', icon: IconChart, href: '/dashboard/history' },
  { label: 'Profile', icon: IconPerson, href: '/dashboard/profile' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [cohortName, setCohortName] = useState('');

  useEffect(() => {
    try {
      const u = localStorage.getItem('camera505_user');
      if (u) {
        const parsed = JSON.parse(u);
        setUserName(parsed.name || '');
      }
    } catch {}

    try {
      const p = getProfile();
      if (p) setCohortName(p.cohort?.name || p.cohortName || '');
    } catch {}
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('camera505_user');
    try { removeNamespacedItem('camera505_first_time'); } catch {}
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname === href || pathname.startsWith(href + '/');

  return (
    <div
      className="min-h-screen bg-[#000000] text-[#FFFFFF] flex flex-col md:flex-row antialiased font-mono"
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
    >
      <SmoothScroll />

      {/* ── DESKTOP FIXED SIDEBAR ───────────────────────────────────── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-[#000000] border-r border-[#222222] z-50">
        {/* Brand Header */}
        <div className="px-6 pt-7 pb-6 border-b border-[#222222] bg-[#000000]">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-none bg-[#FFFFFF] flex items-center justify-center text-[#000000] shrink-0 border border-[#FFFFFF]">
              <IconHeart size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[#FFFFFF] font-bold text-[14px] tracking-[0.08em] leading-none uppercase font-mono group-hover:text-[#FFFFFF] transition-colors">
                CAMERA 505
              </div>
              <div className="text-[9px] text-[#555555] font-mono font-bold tracking-[0.14em] uppercase mt-1">
                Sleep Intelligence
              </div>
            </div>
          </Link>
        </div>

        {/* Calibrated Model Badge (if available) */}
        {cohortName && (
          <div className="mx-3 mt-4 p-3 bg-[#0A0A0A] border border-[#222222] rounded-none">
            <div className="text-[10px] uppercase font-bold text-[#555555] tracking-[0.12em] font-mono mb-1">
              Active Cohort
            </div>
            <div className="text-[12px] font-bold text-[#FFFFFF] leading-snug line-clamp-2 font-mono">
              {cohortName}
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1 px-3 py-6 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="block">
                <div
                  className={`flex items-center gap-3 px-3 py-3 rounded-none text-[12px] font-mono uppercase tracking-[0.08em] border-l-2 transition-colors ${
                    active
                      ? 'bg-[#111111] text-[#FFFFFF] border-l-[#FFFFFF] font-bold'
                      : 'text-[#888888] border-l-transparent hover:text-[#FFFFFF] hover:bg-[#111111] hover:border-l-[#333333]'
                  }`}
                >
                  <Icon size={18} className="shrink-0" strokeWidth={active ? 2 : 1.8} />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Desktop Quick Actions */}
        <div className="px-3 pb-6 pt-5 border-t border-[#222222] space-y-3">
          <StudioLaunchButton
            label="Desktop ECG Studio"
            className="!w-full !py-3 !rounded-none !bg-transparent !border !border-[#333333] !text-[#888888] hover:!text-[#FFFFFF] hover:!bg-[#111111] hover:!border-[#555555] !font-mono !text-[12px] !uppercase !tracking-[0.08em] !shadow-none"
          />

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-3 rounded-none w-full text-[12px] font-mono uppercase tracking-[0.08em] text-[#888888] border border-transparent hover:text-[#FF3333] hover:bg-[#111111] hover:border-[#222222] transition-colors cursor-pointer min-w-0"
          >
            <IconLogout size={16} className="shrink-0" />
            <span className="truncate">
              Sign Out{userName ? ` · ${userName}` : ''}
            </span>
          </button>

          <div className="text-center text-[9px] font-mono text-[#555555] tracking-[0.14em] uppercase select-none pt-1">
            *WE DON&apos;T SUPPORT 67*
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT CONTAINER (Desktop offset via .dashboard-content) ────────── */}
      <div className="dashboard-content min-h-screen flex flex-col bg-[#000000] flex-1">
        <main className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 md:px-12 py-8 md:py-10 pb-32 md:pb-16">
          {children}
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAVIGATION BAR ───────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#000000]/95 border-t border-[#222222] safe-area-pb">
        <div className="flex items-center justify-around h-16 px-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div
                  className={`flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-none border-t-2 transition-colors ${
                    active ? 'text-[#FFFFFF] border-t-[#FFFFFF] bg-[#111111]' : 'text-[#888888] border-t-transparent'
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                  <span className="text-[9px] font-mono font-bold tracking-[0.08em] uppercase">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
