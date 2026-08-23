'use client';

import { useEffect, useRef, useState } from 'react';
import { IconHeart, IconActivity, IconBolt, IconChart, IconStop } from '@/components/ui/Icons';

const FS = 50;
const BUFFER = 500;

function computeQualityMeta(q: number) {
  if (q > 75) return { label: 'Good' as const, color: '#0E9F00' };
  if (q >= 45) return { label: 'Medium' as const, color: '#FFB800' };
  return { label: 'Poor' as const, color: '#FF3333' };
}

interface StudioMetrics {
  bpm: number;
  rmssd: number;
  sdnn: number;
  pnn50: number;
  lfHf: number;
  stress: number;
  apneaRisk: number;
  domFreq: number;
  streamHz: number;
  samples: number;
  leadsOff: boolean;
  connected: boolean;
}

export default function EcgStudioOverlay({
  open,
  onClose,
  onEndSession,
  sourceLabel = 'SIMULATION (50Hz)',
}: {
  open: boolean;
  onClose: () => void;
  onEndSession: () => void;
  sourceLabel?: string;
}) {
  const ecgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fftCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const bufRef = useRef<number[]>([]);
  const peaksRef = useRef<number[]>([]);
  const totalRef = useRef(0);
  const rrRef = useRef<number[]>([]);
  const anomalyRef = useRef(0.05);
  const leadsRef = useRef(false);
  const startRef = useRef(0);
  const metricsRef = useRef<StudioMetrics>({
    bpm: 0, rmssd: 0, sdnn: 0, pnn50: 0, lfHf: 1.5, stress: 0, apneaRisk: 5, domFreq: 1.2,
    streamHz: 0, samples: 0, leadsOff: false, connected: false,
  });

  const [m, setM] = useState<StudioMetrics>(metricsRef.current);
  const [isFallback, setIsFallback] = useState(false);
  const [quality, setQuality] = useState(0);

  useEffect(() => {
    if (!open) return;
    const host = window.location.hostname || 'localhost';
    let retry: ReturnType<typeof setTimeout> | null = null;
    let fallbackIv: ReturnType<typeof setInterval> | null = null;
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    let isSimulator = sourceLabel.toLowerCase().includes('simulator') || sourceLabel.toLowerCase().includes('healthy') || sourceLabel.toLowerCase().includes('sleep') || sourceLabel === 'Simulator';
    try { const d = JSON.parse(localStorage.getItem('camera505_demo') || '{}'); if (d.scenario === 'leads_off') isSimulator = false; } catch {}

    const connect = () => {
      try {
        const ws = new WebSocket(`ws://${host}:8000/ws/live`);
        wsRef.current = ws;
        startRef.current = performance.now();
        ws.onopen = () => {
          metricsRef.current.connected = true;
          setIsFallback(false);
          if (fallbackIv) { clearInterval(fallbackIv); fallbackIv = null; }
        };
        ws.onclose = () => {
          metricsRef.current.connected = false;
          retry = setTimeout(connect, 2500);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            const raw = msg.data ?? msg;
            const val = raw.filtered_ecg ?? raw.ecg_filtered ?? raw.raw_ecg;
            if (val === undefined) return;
            totalRef.current += 1;
            const buf = bufRef.current;
            buf.push(Number(val));
            if (buf.length > BUFFER) buf.splice(0, buf.length - BUFFER);
            if (raw.is_r_peak) {
              peaksRef.current.push(totalRef.current - 1);
              if (peaksRef.current.length > 30) peaksRef.current.shift();
            }
            const rr = raw.rr_interval_ms;
            if (typeof rr === 'number' && rr > 300 && rr < 2000) {
              rrRef.current.push(rr);
              if (rrRef.current.length > 50) rrRef.current.shift();
            }
            leadsRef.current = Boolean(raw.leads_off);
            const anomaly = raw.anomaly_score ?? raw.anomaly_scores?.composite ?? 0.05;
            anomalyRef.current = Number(anomaly) || 0;
            const mm = metricsRef.current;
            mm.bpm = Number(raw.heart_rate_bpm ?? raw.hr_bpm ?? 0);
            mm.samples = totalRef.current;
            mm.leadsOff = leadsRef.current;
            const elapsed = Math.max(0.1, (performance.now() - startRef.current) / 1000);
            mm.streamHz = totalRef.current / elapsed;
            // Prefer backend HRV (same ECG, no new hardware); fallback derive from RR buffers for older payloads
            const rawRmssd = Number(raw.rmssd ?? raw.rmssd_hrv ?? (msg as any).rmssd ?? NaN);
            const rawSdnn = Number(raw.sdnn ?? (msg as any).sdnn ?? NaN);
            const rawPnn50 = Number(raw.pnn50 ?? raw.pNN50 ?? (msg as any).pnn50 ?? NaN);
            const rawLfHf = Number(raw.lf_hf_ratio ?? raw.lf_hf ?? (msg as any).lf_hf_ratio ?? NaN);
            const rawStress = Number(raw.stress_score ?? raw.stress ?? (msg as any).stress_score ?? NaN);
            if (!Number.isNaN(rawRmssd) && rawRmssd > 0) {
              mm.rmssd = rawRmssd;
              mm.sdnn = !Number.isNaN(rawSdnn) && rawSdnn > 0 ? rawSdnn : rawRmssd * 1.35;
              mm.pnn50 = !Number.isNaN(rawPnn50) ? rawPnn50 : Math.max(2, Math.min(38, (rawRmssd - 18) * 0.9));
              mm.lfHf = !Number.isNaN(rawLfHf) && rawLfHf > 0 ? rawLfHf : 1.5;
              if (!Number.isNaN(rawStress)) mm.stress = rawStress;
              else {
                const base = 100 - rawRmssd * 1.2;
                const lfMod = (mm.lfHf - 1.5) * 8;
                mm.stress = Math.max(0, Math.min(100, base + lfMod));
              }
            } else if (rrRef.current.length >= 5) {
              const rrArr = rrRef.current;
              let sum = 0;
              for (let i = 1; i < rrArr.length; i++) sum += (rrArr[i] - rrArr[i - 1]) ** 2;
              const rmssdCalc = Math.sqrt(sum / (rrArr.length - 1));
              mm.rmssd = rmssdCalc;
              // Realistic derivatives: SDNN ~1.35×RMSSD, pNN50 ~ (RMSSD-18)×0.9, LF/HF inverse to vagal tone
              mm.sdnn = rmssdCalc * 1.35;
              mm.pnn50 = Math.max(2, Math.min(38, (rmssdCalc - 18) * 0.9));
              mm.lfHf = Math.max(0.6, Math.min(5, 2.8 - (rmssdCalc - 28) * 0.038));
              const base = 100 - rmssdCalc * 1.2;
              const lfMod = (mm.lfHf - 1.5) * 8;
              mm.stress = Math.max(0, Math.min(100, base + lfMod));
            }
            if (mm.leadsOff) {
              mm.rmssd = 0; mm.sdnn = 0; mm.pnn50 = 0; mm.lfHf = 0; mm.stress = 0;
            }
            mm.apneaRisk = Math.round(anomalyRef.current * 100);
          } catch {}
        };
      } catch {}
    };
    connect();
    if (isSimulator) {
      fallbackTimeout = setTimeout(() => {
        if (metricsRef.current.connected || fallbackIv) return;
        setIsFallback(true);
        let phaseEc = 0;
        let phaseResp = 0;
        startRef.current = performance.now();
        metricsRef.current.bpm = 70;
        metricsRef.current.rmssd = 38;
        metricsRef.current.sdnn = 51;
        metricsRef.current.pnn50 = 18;
        metricsRef.current.lfHf = 1.5;
        metricsRef.current.stress = 52;
        fallbackIv = setInterval(() => {
          if (metricsRef.current.connected) return;
          phaseResp += 2 * Math.PI * 0.23 * 0.02;
          phaseEc += 2 * Math.PI * 1.17 * 0.02;
          const p = phaseEc % (2 * Math.PI);
          let val = 2048 + 80 * Math.sin(phaseResp);
          let isPeak = false;
          if (0.4 <= p && p < 0.8) val += 160 * Math.sin((p - 0.4) / 0.4 * Math.PI);
          else if (1.0 <= p && p < 1.1) val -= 120 * Math.sin((p - 1.0) / 0.1 * Math.PI);
          else if (1.1 <= p && p < 1.25) { val += 1500 * Math.sin((p - 1.1) / 0.15 * Math.PI); if (1.12 < p && p < 1.22) isPeak = true; }
          else if (1.25 <= p && p < 1.35) val -= 320 * Math.sin((p - 1.25) / 0.1 * Math.PI);
          else if (1.6 <= p && p < 2.2) val += 340 * Math.sin((p - 1.6) / 0.6 * Math.PI);
          val += (Math.random() - 0.5) * 10;
          val = Math.max(0, Math.min(4095, val));
          totalRef.current += 1;
          const buf = bufRef.current;
          buf.push(val);
          if (buf.length > BUFFER) buf.splice(0, buf.length - BUFFER);
          if (isPeak) {
            peaksRef.current.push(totalRef.current - 1);
            if (peaksRef.current.length > 30) peaksRef.current.shift();
          }
          const mm = metricsRef.current;
          mm.bpm = 70 + 6 * Math.sin(phaseResp);
          mm.samples = totalRef.current;
          mm.leadsOff = false;
          const elapsed = Math.max(0.1, (performance.now() - startRef.current) / 1000);
          mm.streamHz = totalRef.current / elapsed;
          // Realistic HRV: slow breathing ↑ HRV ↓ stress; stress/apnea ↓ HRV ↑ LF/HF
          let r = 38 + 6 * Math.sin(phaseResp) + Math.sin(performance.now() * 0.0004) * 4;
          r = Math.max(18, Math.min(72, r));
          mm.rmssd = r;
          mm.sdnn = r * 1.35 + (Math.random() - 0.5) * 4;
          mm.pnn50 = Math.max(2, Math.min(38, (r - 18) * 0.9)) + (Math.random() - 0.5) * 1.5;
          mm.lfHf = Math.max(0.6, Math.min(4.5, 2.8 - (r - 28) * 0.038));
          const base = 100 - r * 1.2;
          mm.stress = Math.max(5, Math.min(95, base + (mm.lfHf - 1.5) * 8));
          mm.apneaRisk = 8;
          mm.domFreq = 1.17;
          leadsRef.current = false;
        }, 20);
      }, 1500);
    }
    return () => {
      if (retry) clearTimeout(retry);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (fallbackIv) clearInterval(fallbackIv);
      wsRef.current?.close();
      wsRef.current = null;
      metricsRef.current.connected = false;
      setIsFallback(false);
    };
  }, [open, sourceLabel]);

  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => {
      setM({ ...metricsRef.current });
      try {
        const buf = bufRef.current;
        const leadsOff = leadsRef.current && !isFallback;
        if (buf.length < 10 || leadsOff) {
          setQuality(0);
        } else {
          let lo = Infinity, hi = -Infinity;
          for (const v of buf) { if (v < lo) lo = v; if (v > hi) hi = v; }
          const range = hi - lo;
          const total = totalRef.current;
          const offset = total - buf.length;
          const exclude = new Set<number>();
          const win = 8;
          for (const p of peaksRef.current) {
            const idx = p - offset;
            if (idx >= 0 && idx < buf.length) {
              for (let k = -win; k <= win; k++) {
                const ii = idx + k;
                if (ii >= 0 && ii < buf.length) exclude.add(ii);
              }
            }
          }
          let filtered: number[] = [];
          if (exclude.size > 0) {
            for (let i = 0; i < buf.length; i++) if (!exclude.has(i)) filtered.push(buf[i]);
          } else {
            filtered = buf.slice();
          }
          if (filtered.length < 20) filtered = buf.slice();
          let mean = 0;
          for (const v of filtered) mean += v;
          mean /= filtered.length || 1;
          let varSum = 0;
          for (const v of filtered) varSum += (v - mean) * (v - mean);
          const noise = Math.sqrt(filtered.length ? varSum / filtered.length : 0);
          let q = (range / 1500) * 50 + (1 - noise / 50) * 50;
          q = Math.max(0, Math.min(100, q));
          if (range < 50) q = Math.min(q, 15);
          setQuality(Math.round(q));
        }
      } catch { setQuality(0); }
    }, 250);
    return () => clearInterval(iv);
  }, [open, isFallback]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const setup = (canvas: HTMLCanvasElement) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.offsetWidth || 300;
      const h = canvas.offsetHeight || 150;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w, h };
    };
    const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#1A1A1A';
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        const y = (i / 8) * h;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let j = 1; j < 16; j++) {
        const x = (j / 16) * w;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
    };
    const draw = () => {
      const buf = bufRef.current;
      const ecg = setup(ecgCanvasRef.current!);
      if (ecg) {
        const { ctx, w, h } = ecg;
        drawGrid(ctx, w, h);
        // center line
        ctx.strokeStyle = '#222222';
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
        ctx.setLineDash([]);
        if (leadsRef.current && !isFallback) {
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `700 ${Math.max(11, w/44)}px 'JetBrains Mono', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('LEADS DETACHED — PLACE 3 PADS', w/2, h/2);
        } else if (buf.length > 1) {
          let lo = Infinity, hi = -Infinity;
          for (const v of buf) { if (v < lo) lo = v; if (v > hi) hi = v; }
          if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
          const pad = (hi - lo) * 0.12;
          lo -= pad; hi += pad;
          ctx.beginPath();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.8;
          ctx.lineJoin = 'round';
          for (let i = 0; i < buf.length; i++) {
            const x = (i / BUFFER) * w;
            const y = h - ((buf[i] - lo) / (hi - lo)) * h;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
          const offset = totalRef.current - buf.length;
          ctx.fillStyle = '#0080FF';
          for (const p of peaksRef.current) {
            const idx = p - offset;
            if (idx >= 0 && idx < buf.length) {
              const x = (idx / BUFFER) * w;
              const y = h - ((buf[idx] - lo) / (hi - lo)) * h;
              ctx.beginPath();
              ctx.fillRect(x-2, y-6, 4, 4);
            }
          }
        } else {
          ctx.strokeStyle = '#333333';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
        }
      }
      const fft = setup(fftCanvasRef.current!);
      if (fft) {
        const { ctx, w, h } = fft;
        drawGrid(ctx, w, h);
        if (buf.length >= 128 && !leadsRef.current) {
          const n = buf.length;
          let mean = 0;
          for (const v of buf) mean += v;
          mean /= n;
          const maxBin = Math.floor(20 * n / FS);
          const mags = new Float64Array(maxBin + 1);
          for (let k = 0; k <= maxBin; k++) {
            let re = 0, im = 0;
            for (let i = 0; i < n; i++) {
              const w_hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
              const s = (buf[i] - mean) * w_hann;
              const ang = (-2 * Math.PI * k * i) / n;
              re += s * Math.cos(ang);
              im += s * Math.sin(ang);
            }
            mags[k] = Math.sqrt(re * re + im * im);
          }
          let peakVal = 0, peakK = 0;
          for (let k = 1; k <= maxBin; k++) {
            if (mags[k] > peakVal) { peakVal = mags[k]; peakK = k; }
          }
          if (peakVal > 0) {
            metricsRef.current.domFreq = (peakK * FS) / n;
          }
          const yScale = peakVal > 0 ? (h * 0.85) / peakVal : 0;
          ctx.beginPath();
          ctx.strokeStyle = '#0080FF';
          ctx.lineWidth = 1.5;
          for (let k = 0; k <= maxBin; k++) {
            const x = ((k * FS) / n / 20) * w;
            const y = h - mags[k] * yScale;
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
          if (peakVal > 0) {
            const x = ((peakK * FS) / n / 20) * w;
            ctx.strokeStyle = 'rgba(0,128,255,0.4)';
            ctx.setLineDash([2, 4]);
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [open, isFallback]);

  if (!open) return null;

  const statusText = isFallback ? 'LOCAL SIMULATOR' : !m.connected ? 'OFFLINE' : m.leadsOff ? 'LEADS DETACHED' : `LIVE [${sourceLabel}]`;
  const statusColor = isFallback ? '#0E9F00' : !m.connected ? '#666666' : m.leadsOff ? '#FF3333' : '#0E9F00';
  const qMeta = computeQualityMeta(quality);

  return (
    <div className="fixed inset-0 z-[100] bg-[#000000] text-white flex flex-col font-mono">
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-[#000000] border-b border-[#222222] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-8 h-8 flex items-center justify-center bg-[#FFFFFF] text-[#000000] border border-[#FFFFFF]"><IconHeart size={16} /></span>
          <div className="min-w-0">
            <div className="text-[#FFFFFF] font-black text-[11px] tracking-[0.14em] uppercase truncate">
              CAMERA 505 — ECG STUDIO
            </div>
            <div className="text-[#666666] text-[10px] tracking-[0.08em] uppercase truncate">
              LEAD-II / 50HZ · SPECTRUM 0-20HZ
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="px-2.5 py-1.5 text-[10px] font-bold tracking-[0.10em] uppercase border bg-[#111111] flex items-center gap-1.5" style={{ color: qMeta.color, borderColor: '#222222' }}>
            <span className="w-[8px] h-[8px] inline-block shrink-0" style={{ backgroundColor: qMeta.color }} />
            <span className="hidden sm:inline">ELECTRODE QUALITY:</span>
            <span className="sm:hidden">EQ:</span>
            {qMeta.label}
            <span className="text-[#666666] font-mono tabular-nums"> {quality}</span>
          </div>
          <div className="px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] uppercase border bg-[#111111]" style={{ color: statusColor, borderColor: '#222222' }}>
            {statusText}
          </div>
          <button onClick={onClose} className="px-4 py-1.5 text-[10px] font-bold tracking-[0.12em] uppercase bg-[#111111] hover:bg-[#1A1A1A] border border-[#333333] text-[#888888] hover:text-[#FFFFFF] cursor-pointer">
            CLOSE [ESC]
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#222222] border-b border-[#222222] shrink-0">
        <div className="bg-[#111111] p-4">
          <div className="text-[#666666] text-[9px] font-bold tracking-[0.14em] uppercase mb-2">HEART RATE — BPM</div>
          <div className="text-[32px] font-black leading-none tabular-nums text-[#FFFFFF]">
            {isFallback ? m.bpm.toFixed(1) : m.leadsOff ? '--' : m.bpm.toFixed(1)}
          </div>
          <div className="text-[#666666] text-[9px] tracking-[0.08em] uppercase mt-2">{m.leadsOff && !isFallback ? 'LEADS DETACHED' : 'NORMAL SINUS'}</div>
        </div>
        <div className="bg-[#111111] p-4">
          <div className="text-[#666666] text-[9px] font-bold tracking-[0.14em] uppercase mb-1.5">HRV — RMSSD</div>
          <div className="text-[30px] font-black leading-none tabular-nums text-[#FFFFFF]">
            {m.leadsOff && !isFallback ? '--' : m.rmssd.toFixed(1)}<span className="text-[12px] text-[#555] font-bold ml-1">MS</span>
          </div>
          <div className="font-mono text-[10px] tracking-[0.06em] uppercase mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="text-[#888]">SDNN <span className="text-white font-bold">{m.leadsOff && !isFallback ? '—' : `${m.sdnn.toFixed(1)}`}</span><span className="text-[#555]"> ms</span></span>
            <span className="text-[#888]">pNN50 <span className="text-white font-bold">{m.leadsOff && !isFallback ? '—' : `${m.pnn50.toFixed(1)}%`}</span></span>
          </div>
          <div className="font-mono text-[9px] tracking-[0.06em] uppercase mt-1 flex items-center gap-2">
            <span className={m.leadsOff && !isFallback ? 'text-[#555]' : m.stress > 65 ? 'text-[#FF3333] font-bold' : m.stress > 40 ? 'text-[#FFB800] font-bold' : 'text-[#0E9F00] font-bold'}>STRESS {m.leadsOff && !isFallback ? '—' : `${Math.round(m.stress)}%`}</span>
            <span className="text-[#555]">· LF/HF {m.leadsOff && !isFallback ? '—' : m.lfHf.toFixed(2)}</span>
          </div>
          <div className="text-[#555] text-[8px] tracking-[0.08em] uppercase mt-1">autonomic · same ECG</div>
        </div>
        <div className="bg-[#111111] p-4">
          <div className="text-[#666666] text-[9px] font-bold tracking-[0.14em] uppercase mb-2">APNEA RISK</div>
          <div className="text-[32px] font-black leading-none tabular-nums text-[#0080FF]">
            {m.apneaRisk}%
          </div>
          <div className="text-[#666666] text-[9px] tracking-[0.08em] uppercase mt-2">{m.apneaRisk < 25 ? 'LOW RISK' : m.apneaRisk < 50 ? 'ELEVATED' : 'HIGH RISK'}</div>
        </div>
        <div className="bg-[#111111] p-4">
          <div className="text-[#666666] text-[9px] font-bold tracking-[0.14em] uppercase mb-2">DOM FREQ — FFT</div>
          <div className="text-[32px] font-black leading-none tabular-nums text-[#0080FF]">
            {m.domFreq.toFixed(2)}
          </div>
          <div className="text-[#666666] text-[9px] tracking-[0.08em] uppercase mt-2">HZ · SINUS</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-px bg-[#222222] min-h-0">
        <div className="flex-[2.2] min-h-[180px] bg-[#000000] relative">
          <canvas ref={ecgCanvasRef} className="w-full h-full block" />
          <div className="absolute top-2 left-3 text-[9px] tracking-[0.12em] uppercase font-bold text-[#666666] bg-[#000000] border border-[#222222] px-2 py-1">CH1 — ECG</div>
        </div>
        <div className="bg-[#0A0A0A] border-y border-[#222222] px-3 py-2 flex items-center gap-3 shrink-0">
          <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-[#666666] shrink-0">ELECTRODE QUALITY:</span>
          <span className="text-[10px] font-bold tracking-[0.08em] uppercase shrink-0" style={{ color: qMeta.color }}>{qMeta.label}</span>
          <span className="text-[10px] font-mono tabular-nums text-[#888] shrink-0">{quality}</span>
          <div className="flex-1 h-[8px] bg-[#111111] border border-[#222222] overflow-hidden max-w-[260px]">
            <div className="h-full transition-all duration-300" style={{ width: `${quality}%`, backgroundColor: qMeta.color }} />
          </div>
          <span className="text-[8px] tracking-[0.08em] uppercase text-[#444] hidden sm:inline">R-PEAK RANGE + EMG NOISE · 0—100</span>
          <span className="text-[8px] tracking-[0.08em] uppercase font-bold ml-auto shrink-0 hidden sm:inline" style={{ color: qMeta.color }}>{quality > 75 ? 'GOOD' : quality >= 45 ? 'MEDIUM' : 'POOR'}</span>
        </div>
        <div className="flex-1 min-h-[110px] bg-[#000000] relative">
          <canvas ref={fftCanvasRef} className="w-full h-full block" />
          <div className="absolute top-2 left-3 text-[9px] tracking-[0.12em] uppercase font-bold text-[#666666] bg-[#000000] border border-[#222222] px-2 py-1">CH2 — FFT 0-20HZ</div>
        </div>
      </div>

      <div className="px-5 py-3 bg-[#111111] border-t border-[#222222] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono tracking-[0.08em] uppercase text-[#666666] shrink-0">
        <span>CONTINUOUS 50HZ — LEAD-II AD8232</span>
        <span className="text-[#FFFFFF]">{m.streamHz.toFixed(1)} HZ · {m.samples.toLocaleString()} SAMPLES</span>
      </div>

      <button onClick={onEndSession} className="absolute bottom-6 right-5 sm:right-6 inline-flex items-center gap-2 bg-[#FF3333] hover:bg-[#CC0000] px-4 py-2.5 text-[11px] font-black tracking-[0.12em] uppercase text-white border border-[#FF3333] cursor-pointer">
        ■ END SESSION
      </button>
    </div>
  );
}
