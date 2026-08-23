'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IconHeart } from '@/components/ui/Icons';
import { setNamespacedItem, getNamespacedItem } from '@/lib/userStorage';

const DEMOS = [
  { id: 'healthy', label: 'Healthy Rest · APNEA-ECG', scenario: 'healthy_rest', audio: 'normal', risk: 'LOW', theta: 0.30, tau: 0.48, hr: 70, resp: 14 },
  { id: 'mild', label: 'Snoring & Mild Apnea · SHHS', scenario: 'snoring_episode', audio: 'snoring', risk: 'ELEVATED', theta: 0.38, tau: 0.55, hr: 74, resp: 15.2 },
  { id: 'osa', label: 'Obstructive Apnea Candidate · UCDDB', scenario: 'sleep_apnea', audio: 'snoring', risk: 'HIGH', theta: 0.55, tau: 0.70, hr: 80, resp: 18 },
  { id: 'arrhythmia', label: 'Irregular Rhythm · BIDMC', scenario: 'arrhythmia', audio: 'normal', risk: 'ELEVATED', theta: 0.42, tau: 0.58, hr: 85, resp: 15 },
  { id: 'cough', label: 'Cough Cluster · PSG Audio', scenario: 'cough_attack', audio: 'cough', risk: 'ELEVATED', theta: 0.40, tau: 0.56, hr: 76, resp: 16 },
  { id: 'postmenopause', label: 'Postmenopausal Profile · DREAMS', scenario: 'healthy_rest', audio: 'normal', risk: 'ELEVATED', theta: 0.35, tau: 0.52, hr: 71, resp: 14.5 },
  { id: 'leads-off', label: 'Electrodes Detached · Hardware Test', scenario: 'leads_off', audio: 'normal', risk: 'NO SIGNAL', theta: 0, tau: 0, hr: 0, resp: 0 },
  { id: 'breathing', label: 'Breathing Exercise 6/min · Biofeedback', scenario: 'breathing_exercise', audio: 'normal', risk: 'LOW', theta: 0.28, tau: 0.45, hr: 65, resp: 6 },
  { id: 'stress', label: 'Stress Test · Snore+Cough Mix', scenario: 'stress_test', audio: 'cough', risk: 'ELEVATED', theta: 0.42, tau: 0.58, hr: 88, resp: 16 },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState('healthy');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    const name = email.split('@')[0].replace(/[^a-zA-Z]/g, '') || 'Patient';
    localStorage.setItem(
      'camera505_user',
      JSON.stringify({ email, name: name.charAt(0).toUpperCase() + name.slice(1) })
    );

    const hasProfile = getNamespacedItem('camera505_profile');
    if (!hasProfile) setNamespacedItem('camera505_first_time', 'true');

    setLoading(false);
    router.push(hasProfile ? '/dashboard' : '/quiz');
  };

  const handleDemoLogin = () => {
    const demo = DEMOS.find((item) => item.id === selectedDemo) || DEMOS[0];
    localStorage.setItem('camera505_user', JSON.stringify({ email: 'demo@camera505.ai', name: 'Alex' }));
    // Must set user first so getUserSuffix() resolves to demo user
    setNamespacedItem('camera505_demo', JSON.stringify(demo));
    setNamespacedItem('camera505_profile', JSON.stringify({
      cohortName: demo.label,
      cohort: { key: demo.id, name: demo.label, risk: demo.risk, theta: demo.theta, tau: demo.tau, hr: demo.hr, resp: demo.resp },
    }));
    setNamespacedItem('camera505_first_time', 'false');
    router.push('/dashboard');
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
            CAMERA 505
          </h1>
          <p className="text-[10px] font-bold tracking-[0.20em] text-[#666666] uppercase font-mono">
            SLEEP INTELLIGENCE PLATFORM
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#111111] border border-[#222222] rounded-[4px] p-7 sm:p-8 space-y-6">
          <div>
            <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#FFFFFF] font-mono">SIGN IN TO DASHBOARD</h2>
            <p className="text-[12px] font-mono text-[#888888] mt-2 leading-relaxed">
              Access your cardiorespiratory telemetry and clinical profiles.
            </p>
          </div>

          {error && (
            <div className="bg-[#FF3333]/[0.06] border border-[#FF3333]/30 text-[#FF3333] text-[12px] font-mono font-bold p-3 rounded-[2px]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-[#888888] uppercase tracking-[0.14em] font-mono">
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="patient@camera505.ai"
                className="w-full bg-[#000000] border border-[#333333] focus:border-[#0080FF] rounded-[2px] px-4 py-3.5 text-[13px] font-mono text-[#FFFFFF] placeholder-[#555555] outline-none transition-colors"
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
                className="w-full bg-[#000000] border border-[#333333] focus:border-[#0080FF] rounded-[2px] px-4 py-3.5 text-[13px] font-mono text-[#FFFFFF] placeholder-[#555555] outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#0080FF] hover:bg-[#0066CC] disabled:opacity-50 disabled:cursor-not-allowed text-[#FFFFFF] rounded-[2px] border border-[#0080FF] font-mono font-black uppercase tracking-[0.14em] text-[12px] transition-colors cursor-pointer"
            >
              {loading ? 'SIGNING IN…' : 'SIGN IN'}
            </button>
          </form>

          <div className="relative flex items-center justify-center pt-1">
            <div className="w-full border-t border-[#222222]" />
            <span className="bg-[#111111] px-3 text-[10px] font-black text-[#555555] uppercase tracking-[0.16em] font-mono absolute">
              OR
            </span>
          </div>

          <div className="rounded-[4px] border border-[#222222] bg-[#000000] p-4 space-y-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.10em] text-[#FFFFFF] font-mono">TRY A CLINICAL DEMO</div>
              <div className="text-[11px] font-mono text-[#666666] mt-1">Synthetic ECG + correlated acoustic preset</div>
            </div>
            <select
              value={selectedDemo}
              onChange={(event) => setSelectedDemo(event.target.value)}
              className="w-full bg-[#000000] border border-[#333333] rounded-[2px] px-3 py-2.5 text-[12px] font-mono text-[#FFFFFF] outline-none focus:border-[#0080FF] cursor-pointer"
            >
              {DEMOS.map((demo) => <option key={demo.id} value={demo.id}>{demo.label}</option>)}
            </select>
            <button onClick={handleDemoLogin} type="button" className="w-full h-11 bg-transparent border border-[#333333] rounded-[2px] text-[#FFFFFF] font-mono font-black uppercase tracking-[0.12em] text-[11px] hover:bg-[#111111] hover:border-[#444444] transition-colors cursor-pointer">
              OPEN SELECTED DEMO
            </button>
          </div>

          <p className="text-center text-[12px] font-mono text-[#666666] pt-2">
            Need a new health profile?{' '}
            <Link href="/register" className="text-[#0080FF] font-bold hover:underline">
              CREATE ACCOUNT
            </Link>
          </p>
        </div>

        <div className="text-center text-[10px] font-mono text-[#444444] font-bold uppercase tracking-[0.14em]">
          ESRS CLINICAL DIAGNOSTIC STANDARD · V2.1
        </div>

      </div>
    </div>
  );
}
