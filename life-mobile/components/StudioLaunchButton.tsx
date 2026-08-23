'use client';

import { useState } from 'react';
import { IconMonitor } from '@/components/ui/Icons';

type LaunchState = 'idle' | 'launching' | 'ok' | 'error';

export default function StudioLaunchButton({
  className = '',
  label = 'Pop out Desktop Studio',
}: {
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<LaunchState>('idle');

  const launch = async () => {
    if (state === 'launching') return;
    setState('launching');
    try {
      const host =
        typeof window !== 'undefined' && window.location.hostname
          ? window.location.hostname
          : 'localhost';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`http://${host}:8000/api/launch-ecg-studio`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.status === 'ok') {
        setState('ok');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 3500);
  };

  const text =
    state === 'launching'
      ? 'Launching…'
      : state === 'ok'
      ? 'Studio opened ✓'
      : state === 'error'
      ? 'Backend offline — run start.bat'
      : label;

  const tone =
    state === 'ok'
      ? 'bg-[#0E9F00]/10 border-[#0E9F00]/30 text-[#0E9F00]'
      : state === 'error'
      ? 'bg-[#FF3333]/10 border-[#FF3333]/30 text-[#FF3333]'
      : 'bg-[#111] border-[#333] text-white hover:bg-[#1A1A1A] hover:border-[#555] hover:text-white';

  return (
    <button
      onClick={launch}
      className={`inline-flex items-center justify-center gap-2 rounded-[2px] border font-mono text-[11px] font-bold tracking-[0.06em] uppercase px-3.5 py-2 transition-colors cursor-pointer ${tone} ${className}`}
    >
      <IconMonitor size={13} className="shrink-0" />
      <span className="truncate">{text.toUpperCase()}</span>
    </button>
  );
}
