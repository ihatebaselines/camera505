'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconHeart } from '@/components/ui/Icons';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const user = localStorage.getItem('camera505_user');
      const firstTime = localStorage.getItem('camera505_first_time');
      const profile = localStorage.getItem('camera505_profile');

      if (!user) {
        router.replace('/login');
      } else if (firstTime === 'true' || !profile) {
        router.replace('/quiz');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF] flex items-center justify-center p-6 font-mono antialiased">
      <div className="flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-[4px] bg-[#FFFFFF] border border-[#222222] flex items-center justify-center text-[#0080FF] animate-heartbeat">
          <IconHeart size={32} />
        </div>
        <div className="text-center space-y-2">
          <p className="text-[14px] font-black text-[#FFFFFF] tracking-[0.18em] uppercase font-mono">CAMERA 505</p>
          <p className="text-[11px] font-mono text-[#666666] uppercase tracking-[0.14em] font-bold">INITIALIZING SLEEP INTELLIGENCE…</p>
          <div className="flex items-center justify-center gap-1 pt-2">
            <div className="w-1 h-1 bg-[#0080FF] animate-pulse rounded-[1px]" />
            <div className="w-1 h-1 bg-[#0080FF] animate-pulse rounded-[1px] [animation-delay:200ms]" />
            <div className="w-1 h-1 bg-[#0080FF] animate-pulse rounded-[1px] [animation-delay:400ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}
