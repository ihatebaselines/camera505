'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import dynamicImport from 'next/dynamic';
import {
  IconHeart,
  IconMoon,
  IconWave,
  IconMic,
  IconBolt,
  IconDna,
  IconArrowRight,
} from '@/components/ui/Icons';
import { Parallax, Reveal } from '@/components/ui/Parallax';
import StudioLaunchButton from '@/components/StudioLaunchButton';
import { getHistory, getProfile } from '@/lib/userStorage';

const EcgOscilloscope = dynamicImport(() => import('@/components/EcgOscilloscope'), { ssr: false });

interface NightSessionRecord {
  id: string;
  date: string;
  duration_minutes: number;
  ahi: number;
  classification: string;
  stability_score: number;
  sleep_stages?: {
    deep: number;
    rem: number;
    light: number;
    awake: number;
  };
}

export default function DashboardPage() {
  const [connected, setConnected] = useState(false);
  const [sourceType, setSourceType] = useState<'serial' | 'synthetic' | 'wifi' | 'unknown'>('unknown');
  const [ecgData, setEcgData] = useState<number[]>([]);
  const [frame, setFrame] = useState<{
    ecg_filtered?: number;
    hr_bpm?: number;
    leads_off?: boolean;
    edr_resp_rpm?: number;
    snore_prob?: number;
    anomaly_scores?: { composite?: number };
  }>({
    hr_bpm: 0,
    edr_resp_rpm: 0,
    snore_prob: 0,
    anomaly_scores: { composite: 0 },
    leads_off: true,
  });

  const [userName, setUserName] = useState('');
  const [cohortName, setCohortName] = useState('');
  const [cohortRisk, setCohortRisk] = useState('');
  const [history, setHistory] = useState<NightSessionRecord[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const wsAliveRef = useRef(true);

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

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
      if (p) {
        setCohortName(p.cohort?.name || p.cohortName || '');
        setCohortRisk(p.cohort?.risk || '');
      }
    } catch {}

    try {
      const parsedHist = getHistory();
      if (parsedHist.length > 0) setHistory(parsedHist);
    } catch {}
  }, []);

  const initWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState < 2) return;
    const host =
      typeof window !== 'undefined' && window.location.hostname
        ? window.location.hostname
        : 'localhost';
    const ws = new WebSocket(`ws://${host}:8000/ws/live`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      if (wsAliveRef.current) setTimeout(initWS, 2500);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const raw = msg.data ?? msg; // backend nests frame under "data"
        setSourceType(msg.source_type ?? 'unknown');
        const val = raw.filtered_ecg ?? raw.ecg_filtered ?? raw.raw_ecg;
        if (val !== undefined) {
          setEcgData((prev) => {
            const n = [...prev, Number(val)];
            return n.length > 500 ? n.slice(-500) : n;
          });
        }
        setFrame({
          hr_bpm: raw.leads_off ? 0 : raw.heart_rate_bpm ?? raw.hr_bpm ?? 0,
          leads_off: raw.leads_off ?? true,
          edr_resp_rpm: raw.leads_off ? 0 : raw.respiration_rate_rpm ?? raw.edr_resp_rpm ?? 0,
          snore_prob: raw.leads_off ? 0 : raw.snore_probability ?? raw.snore_prob ?? 0,
          anomaly_scores: { composite: raw.leads_off ? 0 : raw.anomaly_score ?? 0 },
        });
      } catch {}
    };
  }, []);

  useEffect(() => {
    wsAliveRef.current = true;
    initWS();
    return () => {
      wsAliveRef.current = false;
      wsRef.current?.close();
    };
  }, [initWS]);

  const scoreColor = (score: number) =>
    score >= 85 ? '#0E9F00' : score >= 70 ? '#FFB800' : '#FF3333';

  const lastSession = history[0];

  return (
    <div className="relative w-full bg-black min-h-screen">
      {/* ── PARALLAX BACKGROUND LAYER ─────────────────────────────── */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <Parallax speed={0.3} className="absolute -top-44 left-[-10rem] w-[30rem] h-[30rem] bg-[#0080FF]/[0.05] blur-3xl" />
        <Parallax speed={0.16} className="absolute top-[34rem] right-[-12rem] w-[26rem] h-[26rem] bg-[#222]/[0.6] blur-3xl" />
        <Parallax speed={0.07} className="absolute top-[70rem] left-[-6rem] w-[22rem] h-[22rem] bg-[#0080FF]/[0.03] blur-3xl" />
        <Parallax speed={0.05} className="absolute -top-6 inset-x-0 text-center text-[200px] leading-none font-black tracking-[-0.04em] watermark select-none hidden lg:block">
          505
        </Parallax>
      </div>

      <div className="space-y-8 sm:space-y-10 px-1">

        {/* ── HERO (centered) ──────────────────────────────────────── */}
        <Reveal>
          <div className="flex flex-col items-center text-center gap-6 pt-4 sm:pt-6">
            <div>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="w-[6px] h-[6px] bg-[#0080FF] inline-block" />
                <span className="text-[10px] font-mono font-bold tracking-[0.16em] uppercase text-[#888]">
                  [CAMERA 505] · SLEEP INTELLIGENCE PLATFORM
                </span>
              </div>
              <h1 className="font-mono text-[36px] sm:text-[52px] leading-[0.98] font-black tracking-[-0.04em] text-white">
                GOOD {timeGreeting.toUpperCase()},
                <br />
                <span className="text-[#0080FF]">{(userName || 'PATIENT').toUpperCase()}</span>
                <span className="text-white">.</span>
              </h1>
              <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[#666] mt-4 font-bold">{todayStr.toUpperCase()} · SYSTEM READY</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <div
                className={`flex items-center gap-2.5 px-3 py-2 rounded-[2px] text-[11px] font-mono font-bold uppercase tracking-[0.08em] border ${
                  connected && sourceType === 'serial' && !frame.leads_off
                    ? 'bg-[#0E9F00]/10 text-[#0E9F00] border-[#0E9F00]/30'
                    : 'bg-[#111] text-[#666] border-[#222]'
                }`}
              >
                <span
                  className={`w-[7px] h-[7px] inline-block ${
                    connected && sourceType === 'serial' && !frame.leads_off ? 'bg-[#0E9F00] animate-pulse' : 'bg-[#444]'
                  }`}
                />
                <span>{connected && sourceType === 'serial' && !frame.leads_off ? 'SENSOR ONLINE' : sourceType === 'serial' ? 'NO ECG SIGNAL' : 'SIMULATOR MODE'}</span>
                <span className="text-[#444] font-normal hidden sm:inline">[50HZ]</span>
              </div>

              <Link href="/dashboard/night">
                <button className="btn-go px-5 py-2.5 text-[11px] rounded-[2px]">
                  <IconMoon size={14} />
                  <span>START NIGHT</span>
                </button>
              </Link>
            </div>
          </div>
        </Reveal>

        {/* ── ACTIVE COHORT BANNER ────────────────────────────────── */}
        {cohortName && (
          <Reveal delay={80}>
            <div className="bg-[#111] border border-[#222] rounded-[2px] p-4 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#0A0A0A] border border-[#222] rounded-[2px] flex items-center justify-center text-[#0080FF] shrink-0">
                  <IconDna size={18} />
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] font-bold text-[#666] block">
                    CALIBRATED ESRS BASELINE MODEL
                  </span>
                  <span className="text-[13px] font-mono font-bold tracking-[-0.01em] text-white">{cohortName.toUpperCase()}</span>
                </div>
              </div>
              {cohortRisk && (
                <span
                  className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-[2px] uppercase self-start sm:self-auto border tracking-[0.08em] ${
                    cohortRisk === 'HIGH'
                      ? 'bg-[#FF3333]/10 text-[#FF3333] border-[#FF3333]/30'
                      : cohortRisk === 'ELEVATED'
                      ? 'bg-[#FFB800]/10 text-[#FFB800] border-[#FFB800]/30'
                      : 'bg-[#0E9F00]/10 text-[#0E9F00] border-[#0E9F00]/30'
                  }`}
                >
                  {cohortRisk} RISK
                </span>
              )}
            </div>
          </Reveal>
        )}

        {/* ── LAST NIGHT CARD ─────────────────────────────────────── */}
        <Reveal delay={120}>
          <div className="bg-[#111] border border-[#222] rounded-[2px] p-6 sm:p-6">
            <div className="flex items-center justify-between mb-6 border-b border-[#222] pb-3">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[#888]">LAST NIGHT ACTIVITY</span>
              {lastSession && (
                <Link
                  href="/dashboard/history"
                  className="font-mono text-[11px] font-bold tracking-[0.06em] uppercase text-[#0080FF] hover:text-white transition-colors"
                >
                  ALL SESSIONS ({history.length}) →
                </Link>
              )}
            </div>

            {lastSession ? (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
                  <div className="flex items-baseline gap-4">
                    <span
                      className="text-[64px] sm:text-[72px] font-mono font-black tracking-[-0.04em] leading-none tabular-nums"
                      style={{ color: scoreColor(lastSession.stability_score) }}
                    >
                      {lastSession.stability_score}
                    </span>
                    <div>
                      <div className="font-mono text-[11px] tracking-[0.08em] uppercase text-[#666] font-bold">/ 100 STABILITY</div>
                      <span className="bg-[#0E9F00]/10 text-[#0E9F00] border border-[#0E9F00]/20 text-[10px] font-mono font-bold px-2 py-1 rounded-[2px] uppercase mt-1.5 inline-block tracking-[0.08em]">
                        {lastSession.classification.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                    <span className="bg-[#0A0A0A] border border-[#222] rounded-[2px] px-2.5 py-1.5 text-[#888] font-bold uppercase tracking-[0.06em]">
                      AHI <strong className="text-white font-black tabular-nums ml-1">{lastSession.ahi}</strong> <span className="text-[#555] font-normal normal-case tracking-normal">events/h</span>
                    </span>
                    <span className="bg-[#0A0A0A] border border-[#222] rounded-[2px] px-2.5 py-1.5 text-[#888] font-bold uppercase tracking-[0.06em]">
                      <strong className="text-white font-black tabular-nums">
                        {Math.floor(lastSession.duration_minutes / 60)}H {lastSession.duration_minutes % 60}M
                      </strong>
                    </span>
                    <span className="bg-[#0A0A0A] border border-[#222] rounded-[2px] px-2.5 py-1.5 text-[#666] font-mono font-bold uppercase tracking-[0.06em]">
                      {new Date(lastSession.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      }).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Sleep Stages Progress Bar — brutalist thin */}
                {lastSession.sleep_stages && (
                  <div className="space-y-2.5 pt-2">
                    <div className="flex justify-between font-mono text-[10px] tracking-[0.1em] uppercase font-bold text-[#666]">
                      <span>SLEEP ARCHITECTURE BREAKDOWN</span>
                      <span className="text-[#333]">100%</span>
                    </div>
                    <div className="h-[8px] w-full flex overflow-hidden gap-[1px] bg-[#222] rounded-[2px] p-[1px]">
                      <div
                        className="bg-white h-full rounded-[1px]"
                        style={{ width: `${lastSession.sleep_stages.deep}%` }}
                        title={`Deep Sleep: ${lastSession.sleep_stages.deep}%`}
                      />
                      <div
                        className="bg-[#0080FF] h-full rounded-[1px]"
                        style={{ width: `${lastSession.sleep_stages.rem}%` }}
                        title={`REM Sleep: ${lastSession.sleep_stages.rem}%`}
                      />
                      <div
                        className="bg-[#555] h-full rounded-[1px]"
                        style={{ width: `${lastSession.sleep_stages.light}%` }}
                        title={`Light Sleep: ${lastSession.sleep_stages.light}%`}
                      />
                      <div
                        className="bg-[#FF3333] h-full rounded-[1px]"
                        style={{ width: `${lastSession.sleep_stages.awake}%` }}
                        title={`Awake: ${lastSession.sleep_stages.awake}%`}
                      />
                    </div>
                    <div className="flex flex-wrap gap-4 pt-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-[#666]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-[8px] h-[8px] bg-white border border-[#333] inline-block" /> DEEP ({lastSession.sleep_stages.deep}%)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-[8px] h-[8px] bg-[#0080FF] inline-block" /> REM ({lastSession.sleep_stages.rem}%)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-[8px] h-[8px] bg-[#555] inline-block" /> LIGHT ({lastSession.sleep_stages.light}%)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-[8px] h-[8px] bg-[#FF3333] inline-block" /> AWAKE ({lastSession.sleep_stages.awake}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center border border-dashed border-[#222] rounded-[2px] bg-[#0A0A0A] flex flex-col items-center justify-center">
                <div className="w-12 h-12 bg-[#111] border border-[#222] rounded-[2px] flex items-center justify-center text-[#666] mb-4">
                  <IconMoon size={22} />
                </div>
                <h3 className="font-mono text-[13px] font-bold tracking-[0.06em] uppercase text-white mb-1.5">NO NIGHT SESSIONS RECORDED YET</h3>
                <p className="font-mono text-[11px] leading-relaxed text-[#666] max-w-sm mb-6">
                  CONNECT YOUR 3-LEAD AD8232 ECG ELECTRODES (RA, LA, RL) AND START MONITORING TONIGHT.
                </p>
                <Link href="/dashboard/night">
                  <button className="btn-go px-5 py-2.5 text-[11px] rounded-[2px]">
                    START FIRST NIGHT SESSION
                    <IconArrowRight size={13} />
                  </button>
                </Link>
              </div>
            )}
          </div>
        </Reveal>

        {/* ── LIVE SIGNALS GRID ───────────────────────────────────── */}
        <Reveal delay={80}>
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#666] block mb-3 text-center">LIVE CARDIORESPIRATORY TELEMETRY · 50HZ</span>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-[#111] border border-[#222] rounded-[2px] p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#FF3333] flex items-center justify-center">
                    <IconHeart size={14} />
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#555] border border-[#222] bg-[#0A0A0A] px-2 py-0.5 rounded-[2px]">BPM</span>
                </div>
                <div className="font-mono text-[32px] sm:text-[36px] font-black text-[#FF3333] tabular-nums tracking-[-0.03em] leading-none">
                  {frame.leads_off ? '—' : Math.round(frame.hr_bpm ?? 0)}
                </div>
                <div className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#555] mt-2">HEART RATE · SINUS</div>
              </div>

              <div className="bg-[#111] border border-[#222] rounded-[2px] p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#0080FF] flex items-center justify-center">
                    <IconWave size={14} />
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#555] border border-[#222] bg-[#0A0A0A] px-2 py-0.5 rounded-[2px]">RPM</span>
                </div>
                <div className="font-mono text-[32px] sm:text-[36px] font-black text-[#0080FF] tabular-nums tracking-[-0.03em] leading-none">
                  {frame.leads_off ? '—' : (frame.edr_resp_rpm ?? 0).toFixed(1)}
                </div>
                <div className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#555] mt-2">RESP · EDR DERIVED</div>
              </div>

              <div className="bg-[#111] border border-[#222] rounded-[2px] p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#FFB800] flex items-center justify-center">
                    <IconMic size={14} />
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#555] border border-[#222] bg-[#0A0A0A] px-2 py-0.5 rounded-[2px]">ACOUSTIC</span>
                </div>
                <div className="font-mono text-[32px] sm:text-[36px] font-black text-[#FFB800] tabular-nums tracking-[-0.03em] leading-none">
                  {frame.leads_off ? '—' : `${Math.round((frame.snore_prob ?? 0) * 100)}%`}
                </div>
                <div className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#555] mt-2">SNORE INTENSITY</div>
              </div>

              <div className="bg-[#111] border border-[#222] rounded-[2px] p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-white flex items-center justify-center">
                    <IconBolt size={14} />
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#555] border border-[#222] bg-[#0A0A0A] px-2 py-0.5 rounded-[2px]">INDEX</span>
                </div>
                <div className="font-mono text-[32px] sm:text-[36px] font-black text-white tabular-nums tracking-[-0.03em] leading-none">
                  {frame.leads_off ? '—' : `${((frame.anomaly_scores?.composite ?? 0) * 100).toFixed(0)}%`}
                </div>
                <div className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#555] mt-2">ANOMALY · COHERENCE</div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── LIVE ECG OSCILLOSCOPE ───────────────────────────────── */}
        <Reveal delay={100}>
          <div className="bg-[#111] border border-[#222] rounded-[2px] p-5 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222] pb-3">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2">
                  <span className="w-[7px] h-[7px] bg-[#FF3333] animate-pulse inline-block" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#888]">LEAD-II ECG · LIVE</span>
                </span>
                <span className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase text-[#0E9F00] bg-[#0E9F00]/10 border border-[#0E9F00]/20 px-2 py-0.5 rounded-[2px]">
                  50 HZ
                </span>
              </div>

              <StudioLaunchButton />
            </div>

            <div className="rounded-[2px] overflow-hidden bg-black border border-[#222] p-2 min-h-[260px]">
              <EcgOscilloscope data={ecgData} leads_off={frame.leads_off ?? false} />
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.06em] uppercase text-[#444]">
              <span>AD8232 · 50HZ STREAM · 500 SAMPLE WINDOW</span>
              <span className="text-[#333]">TERMINAL TRACE</span>
            </div>
          </div>
        </Reveal>

      </div>
    </div>
  );
}
