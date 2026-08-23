'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IconHeart } from '@/components/ui/Icons';
import { setNamespacedItem } from '@/lib/userStorage';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill out all registration fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your entries.');
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));

    // Save user info — per-user isolation
    localStorage.setItem(
      'camera505_user',
      JSON.stringify({ email: email.trim(), name: fullName.trim() })
    );
    setNamespacedItem('camera505_first_time', 'true');

    setLoading(false);
    router.push('/quiz');
  };

  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF] flex flex-col items-center justify-center p-4 sm:p-6 font-mono antialiased">
      <div className="w-full max-w-[410px] space-y-6">

        {/* Logo / Brand Header */}
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-[4px] bg-[#FFFFFF] border border-[#222222] flex items-center justify-center text-[#0080FF] mx-auto">
            <IconHeart size={28} />
          </div>
          <h1 className="text-[26px] sm:text-[28px] font-black tracking-[-0.04em] text-[#FFFFFF] font-mono uppercase">
            CREATE HEALTH PROFILE
          </h1>
          <p className="text-[10px] font-bold tracking-[0.20em] text-[#666666] uppercase font-mono">
            CAMERA 505 · SLEEP INTELLIGENCE
          </p>
        </div>

        {/* Registration Card */}
        <div className="bg-[#111111] border border-[#222222] rounded-[4px] p-7 sm:p-8 space-y-6">
          <div>
            <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#FFFFFF] font-mono">NEW PATIENT REGISTRATION</h2>
            <p className="text-[12px] font-mono text-[#888888] mt-2 leading-relaxed">
              Set up your profile to unlock personalized CatBoost cohort calibration.
            </p>
          </div>

          {error && (
            <div className="bg-[#FF3333]/[0.06] border border-[#FF3333]/30 text-[#FF3333] text-[12px] font-mono font-bold p-3 rounded-[2px]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-[#888888] uppercase tracking-[0.14em] font-mono">
                FULL NAME
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Alex Morgan"
                className="w-full bg-[#000000] border border-[#333333] focus:border-[#0080FF] rounded-[2px] px-4 py-3 text-[13px] font-mono text-[#FFFFFF] placeholder-[#555555] outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-[#888888] uppercase tracking-[0.14em] font-mono">
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.morgan@health.org"
                className="w-full bg-[#000000] border border-[#333333] focus:border-[#0080FF] rounded-[2px] px-4 py-3 text-[13px] font-mono text-[#FFFFFF] placeholder-[#555555] outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-[#888888] uppercase tracking-[0.14em] font-mono">
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#000000] border border-[#333333] focus:border-[#0080FF] rounded-[2px] px-4 py-3 text-[13px] font-mono text-[#FFFFFF] placeholder-[#555555] outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-[#888888] uppercase tracking-[0.14em] font-mono">
                CONFIRM PASSWORD
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#000000] border border-[#333333] focus:border-[#0080FF] rounded-[2px] px-4 py-3 text-[13px] font-mono text-[#FFFFFF] placeholder-[#555555] outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#0080FF] hover:bg-[#0066CC] disabled:opacity-50 disabled:cursor-not-allowed text-[#FFFFFF] rounded-[2px] border border-[#0080FF] font-mono font-black uppercase tracking-[0.12em] text-[12px] transition-colors mt-2 cursor-pointer"
            >
              {loading ? 'CREATING PROFILE…' : 'PROCEED TO ESRS HEALTH QUIZ →'}
            </button>
          </form>

          <p className="text-center text-[12px] font-mono text-[#666666] pt-2">
            Already have an account?{' '}
            <Link href="/login" className="text-[#0080FF] font-bold hover:underline">
              SIGN IN
            </Link>
          </p>
        </div>

        <div className="text-center text-[10px] font-mono text-[#444444] font-bold uppercase tracking-[0.14em]">
          *WE DON&apos;T SUPPORT 67* · SECURE LOCAL CLINICAL ENCAPSULATION
        </div>

      </div>
    </div>
  );
}
