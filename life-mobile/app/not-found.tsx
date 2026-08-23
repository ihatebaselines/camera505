'use client';

import Link from 'next/link';
import { IconHeart, IconArrowRight } from '@/components/ui/Icons';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF] flex items-center justify-center p-6 font-mono antialiased">
      <div className="bg-[#111111] border border-[#222222] rounded-[4px] p-8 max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-[4px] bg-[#FFFFFF] text-[#0080FF] border border-[#222222] flex items-center justify-center mx-auto">
          <IconHeart size={28} />
        </div>

        <div>
          <h2 className="text-[14px] font-black text-[#FFFFFF] tracking-[0.14em] uppercase font-mono">ROUTE NOT FOUND</h2>
          <p className="text-[12px] font-mono text-[#888888] mt-3 leading-relaxed">
            The requested monitoring endpoint does not exist. Return to your primary dashboard overview.
          </p>
          <p className="text-[10px] font-mono text-[#444444] mt-2 uppercase tracking-[0.12em] font-bold">ERR_404 · NO SIGNAL</p>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 w-full h-12 bg-[#0080FF] hover:bg-[#0066CC] text-[#FFFFFF] rounded-[2px] border border-[#0080FF] font-mono font-black uppercase tracking-[0.14em] text-[12px] transition-colors cursor-pointer"
        >
          RETURN TO DASHBOARD
          <IconArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
