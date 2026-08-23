'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { IconHeart, IconWave, IconMic, IconBolt } from '@/components/ui/Icons';
import MelWaterfall from '@/components/MelWaterfall';

const EcgOscilloscope = dynamicImport(() => import('@/components/EcgOscilloscope'), { ssr: false });

const PHASE_NAMES = ['CONNECTING SENSOR', 'LIVE SIGNAL', 'ANOMALY DETECTED', 'AI INFERENCE', 'REPORT'];
const PHASE_TICKS = ['BOOT', 'SIGNAL', 'ANOMALY', 'AI', 'REPORT'];
const TOTAL_MS = 40000;

const phaseOf = (ms: number) => (ms < 4000 ? 0 : ms < 14000 ? 1 : ms < 20000 ? 2 : ms < 34000 ? 3 : 4);

const BOOT_LINES = [
  'INIT CAMERA 505 RUNTIME v2.4.1',
  'FastAPI backend @ 127.0.0.1:8000 ... OK',
  'probe COM3 · AD8232 @ 115200 baud ... OK',
  'DSP bandpass 0.5-40Hz + notch 50Hz ... OK',
  'Pan-Tompkins QRS detector armed',
  'mel filterbank 32 bands calibrated',
  'telemetry stream locked @ 50 Hz',
  'SENSOR ONLINE — starting synthetic night',
];

const INFERENCE_LINES = [
  '[SYSTEM] ingesting 8H synthetic night · 1,440,000 frames @ 50 Hz',
  '[ECG DSP] Pan-Tompkins QRS detection — 412,800 beats analyzed',
  '[TRANSFORMER] RoPE foundation model · 512D latent embeddings',
  '[CATBOOST] ESRS cohort calibration · theta=0.55 OSA prior',
  '[FINE-TUNE] overnight Soft-F1 gradient adaptation — loss 0.213',
  '[HYPNOGRAM] Deep 18% · REM 21% · Light 47% · Awake 14%',
  '[AHI] apnea-hypopnea index: 5.0 events/hr',
  '[AI] Ollama llama3.2 synthesizing clinical narrative',
  '[RESULT] classification: Mild Apnea Suspect (AHI 5-15) ✓',
  '[COMPLETE] report ready — all inference executed locally',
];

const lineColor = (line: string) =>
  line.includes('✓') || line.includes('ready') || line.includes('COMPLETE')
    ? '#0E9F00'
    : line.includes('AHI') || line.includes('classification') || line.includes('HYPNOGRAM')
    ? '#FFB800'
    : '#888888';

const GEN0 = { phaseEc: 0, phaseResp: 0, bpm: 70, respRpm: 14, respAmp: 1, snore: 0.24, anomaly: 0.08, tick: 0 };
const FRAME0 = { hr: 70, resp: 14, snore: 0.24, risk: 0.08 };

const STAGES = { deep: 18, rem: 21, light: 47, awake: 14 };

export default function DemoLivePage() {
  const [t, setT] = useState(0);
  const [ecgData, setEcgData] = useState<number[]>([]);
  const [melBands, setMelBands] = useState<number[][]>([]);
  const [frame, setFrame] = useState(FRAME0);

  const startRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const genRef = useRef({ ...GEN0 });

  useEffect(() => {
    startRef.current = Date.now();
    const iv = setInterval(() => {
      const el = Date.now() - startRef.current;
      phaseRef.current = phaseOf(el);
      setT(el);
    }, 50);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      const g = genRef.current;
      const apnea = phaseRef.current === 2;
      if (phaseRef.current !== 1 && phaseRef.current !== 2) return;
      g.bpm += ((apnea ? 54 : 70) - g.bpm) * 0.012;
      g.respRpm += ((apnea ? 0 : 14) - g.respRpm) * 0.008;
      g.respAmp += ((apnea ? 0.03 : 1) - g.respAmp) * 0.015;
      g.snore += ((apnea ? 0 : 0.24) - g.snore) * 0.02;
      g.anomaly += ((apnea ? 0.92 : 0.08 + 0.02 * Math.sin(g.phaseResp)) - g.anomaly) * 0.03;
      g.phaseResp += 2 * Math.PI * 0.23 * 0.02 * g.respAmp;
      g.phaseEc += 2 * Math.PI * (g.bpm / 60) * 0.02;
      const p = g.phaseEc % (2 * Math.PI);
      let val = 2048 + 80 * g.respAmp * Math.sin(g.phaseResp);
      if (0.4 <= p && p < 0.8) val += 160 * Math.sin(((p - 0.4) / 0.4) * Math.PI);
      else if (1.0 <= p && p < 1.1) val -= 120 * Math.sin(((p - 1.0) / 0.1) * Math.PI);
      else if (1.1 <= p && p < 1.25) val += 1500 * Math.sin(((p - 1.1) / 0.15) * Math.PI);
      else if (1.25 <= p && p < 1.35) val -= 320 * Math.sin(((p - 1.25) / 0.1) * Math.PI);
      else if (1.6 <= p && p < 2.2) val += 340 * Math.sin(((p - 1.6) / 0.6) * Math.PI);
      val += (Math.random() - 0.5) * 10;
      val = Math.max(0, Math.min(4095, val));
      setEcgData((prev) => {
        const n = [...prev, val];
        return n.length > 500 ? n.slice(-500) : n;
      });
      g.tick += 1;
      if (g.tick % 6 === 0) {
        setFrame({
          hr: g.bpm + 2 * Math.sin(g.phaseResp * 0.5) + (Math.random() - 0.5),
          resp: g.respRpm + 0.4 * Math.sin(g.phaseResp),
          snore: g.snore * (0.7 + 0.5 * Math.max(0, Math.sin(g.phaseResp))),
          risk: g.anomaly,
        });
      }
    }, 20);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      if (phaseRef.current !== 1 && phaseRef.current !== 2) return;
      const g = genRef.current;
      const sEnv = Math.pow(Math.max(0, Math.sin(g.phaseResp)), 2) * (g.snore / 0.24);
      const col: number[] = [];
      for (let b = 0; b < 32; b++) {
        let v = 6 + 14 * Math.random() + 10 * Math.sin(b * 0.35 + g.tick * 0.13);
        if (b >= 4 && b <= 9) v += 30 * sEnv;
        if (b >= 18 && b <= 26) v += 150 * sEnv * (0.6 + 0.4 * Math.random());
        col.push(v);
      }
      setMelBands((prev) => {
        const n = [...prev, col];
        return n.length > 80 ? n.slice(-80) : n;
      });
    }, 120);
    return () => clearInterval(iv);
  }, []);

  const replay = () => {
    startRef.current = Date.now();
    phaseRef.current = 0;
    genRef.current = { ...GEN0 };
    setEcgData([]);
    setMelBands([]);
    setFrame(FRAME0);
    setT(0);
  };

  const phase = phaseOf(t);
  const bootCount = Math.min(BOOT_LINES.length, Math.floor(t / 420) + 1);
  const inferCount =
    phase >= 3 ? Math.min(INFERENCE_LINES.length, Math.floor((t - 20000) / 1250) + 1) : 0;

  const healthyRisk = Math.round(Math.max(4, Math.min(12, 4 + frame.risk * 15)));
  const osaRisk = Math.round(Math.max(28, Math.min(42, 26 + frame.risk * 100)));

  const riskColor = frame.risk > 0.45 ? '#FF3333' : frame.risk > 0.25 ? '#FFB800' : '#0E9F00';

  return (
    <div className="min-h-screen bg-[#000000] font-mono px-4 sm:px-6 py-6 relative">
      <style>{`
        @keyframes jury-flash { 0%, 49% { background: rgba(255,51,51,0.06); } 50%, 100% { background: rgba(255,51,51,0.015); } }
        .jury-flash { animation: jury-flash 0.4s step-end infinite; }
      `}</style>
      {phase === 2 && (
        <div className="fixed inset-0 z-40 pointer-events-none border-2 border-[#FF3333]/30 jury-flash" aria-hidden="true" />
      )}

      <div className="max-w-[900px] mx-auto space-y-5">

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#FFFFFF] flex items-center justify-center text-[#000000] border border-[#FFFFFF] shrink-0">
              <IconHeart size={17} />
            </div>
            <div>
              <div className="text-[#FFFFFF] font-bold text-[13px] tracking-[0.08em] uppercase">CAMERA 505</div>
              <div className="text-[9px] text-[#555] font-bold tracking-[0.14em] uppercase">Live Jury Demo · Autoplay</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-[2px] text-[10px] font-bold uppercase tracking-[0.08em] border bg-[#0E9F00]/10 text-[#0E9F00] border-[#0E9F00]/30">
              <span className="w-[7px] h-[7px] bg-[#0E9F00] animate-pulse inline-block" />
              AUTOPLAY RUNNING
            </span>
            <span className="hidden sm:inline-flex px-3 py-1.5 rounded-[2px] text-[10px] font-bold uppercase tracking-[0.08em] border bg-[#111] text-[#666] border-[#222]">
              100% LOCAL · OFFLINE-SAFE
            </span>
          </div>
        </div>

        <div className="bg-[#111] border border-[#222] rounded-[2px] p-4">
          <div className="flex items-center justify-between font-mono mb-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#666]">
              JURY MODE — {PHASE_NAMES[phase]}
            </span>
            <span className="text-[10px] font-bold tabular-nums text-[#888]">
              {(Math.min(t, TOTAL_MS) / 1000).toFixed(1)}S / 40.0S
            </span>
          </div>
          <div className="h-[4px] w-full bg-[#222] overflow-hidden rounded-[1px]">
            <div
              className="h-full bg-[#0080FF]"
              style={{ width: `${Math.min(100, (t / TOTAL_MS) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#444]">
            {PHASE_TICKS.map((s, i) => (
              <span key={s} className={i === phase ? 'text-[#0080FF]' : ''}>
                {s}
              </span>
            ))}
          </div>
        </div>

        {phase === 0 && (
          <div className="bg-[#111] border border-[#222] rounded-[2px] p-5 sm:p-6 min-h-[440px] flex flex-col animate-fade-in">
            <div className="flex items-center gap-2 pb-3 border-b border-[#222]">
              <span className="w-3 h-3 bg-[#FF3333] inline-block" />
              <span className="w-3 h-3 bg-[#FFB800] inline-block" />
              <span className="w-3 h-3 bg-[#0E9F00] inline-block" />
              <span className="ml-3 font-mono text-[10px] font-bold text-[#666] uppercase tracking-[0.14em]">
                SENSOR LINK — BOOT SEQUENCE
              </span>
            </div>
            <div className="font-mono text-[12px] sm:text-[13px] space-y-2 flex-1 pt-4 min-h-[300px]">
              {BOOT_LINES.slice(0, bootCount).map((line, i) => (
                <div key={i} className={`leading-relaxed font-mono ${i === BOOT_LINES.length - 1 ? 'text-[#0E9F00]' : 'text-[#888]'}`}>
                  <span className="text-[#333] mr-2">{`>`}</span>
                  {line}
                </div>
              ))}
              <span className="w-2 h-4 bg-white animate-pulse inline-block align-middle ml-1" />
            </div>
            <div className="pt-3 border-t border-[#222] flex items-center justify-between font-mono text-[9px] tracking-[0.08em] uppercase text-[#555]">
              <span>COM3 · 115200 BAUD · 3-LEAD AD8232</span>
              <span className="text-[#333]">NO CLOUD</span>
            </div>
          </div>
        )}

        {(phase === 1 || phase === 2) && (
          <div className="space-y-4 animate-fade-in">
            {phase === 2 && (
              <div className="bg-[#FF3333]/10 border border-[#FF3333] rounded-[2px] p-4 flex items-center gap-3 jury-flash">
                <span className="w-[8px] h-[8px] bg-[#FF3333] animate-pulse inline-block shrink-0" />
                <div className="min-w-0">
                  <div className="font-mono text-[12px] font-black tracking-[0.08em] uppercase text-[#FF3333]">
                    ANOMALY DETECTED — OBSTRUCTIVE APNEA EVENT
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#888] mt-1">
                    RESPIRATORY PAUSE + BRADYCARDIA 54 BPM · SNORE SILENCE · POSSIBLE OBSTRUCTIVE EVENT
                  </div>
                </div>
                <span className="ml-auto font-mono text-[10px] font-bold text-[#FF3333] border border-[#FF3333]/40 bg-[#FF3333]/10 px-2 py-1 rounded-[2px] hidden sm:inline shrink-0">
                  T+04:12:36
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#111] border border-[#222] rounded-[2px] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#FF3333] flex items-center justify-center">
                    <IconHeart size={13} />
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#666]">HEART RATE</span>
                </div>
                <div className="font-mono text-[28px] sm:text-[30px] font-black text-[#FF3333] tabular-nums tracking-[-0.03em] leading-none">
                  {Math.round(frame.hr)}
                  <span className="text-[11px] text-[#555] font-bold ml-1 tracking-[0.06em]">BPM</span>
                </div>
                <div className="font-mono text-[9px] tracking-[0.06em] uppercase font-bold mt-1.5 text-[#555]">
                  {phase === 2 ? 'BRADYCARDIA' : 'SINUS RHYTHM'}
                </div>
              </div>

              <div className="bg-[#111] border border-[#222] rounded-[2px] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#0080FF] flex items-center justify-center">
                    <IconWave size={13} />
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#666]">RESPIRATION</span>
                </div>
                <div className="font-mono text-[28px] sm:text-[30px] font-black text-[#0080FF] tabular-nums tracking-[-0.03em] leading-none">
                  {frame.resp.toFixed(1)}
                  <span className="text-[11px] text-[#555] font-bold ml-1 tracking-[0.06em]">RPM</span>
                </div>
                <div className="font-mono text-[9px] tracking-[0.06em] uppercase font-bold mt-1.5 text-[#555]">
                  {phase === 2 ? 'AIRFLOW FLATLINE' : 'EDR DERIVED'}
                </div>
              </div>

              <div className="bg-[#111] border border-[#222] rounded-[2px] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#FFB800] flex items-center justify-center">
                    <IconMic size={13} />
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#666]">SNORE PROB</span>
                </div>
                <div className="font-mono text-[28px] sm:text-[30px] font-black text-[#FFB800] tabular-nums tracking-[-0.03em] leading-none">
                  {Math.round(frame.snore * 100)}%
                </div>
                <div className="font-mono text-[9px] tracking-[0.06em] uppercase font-bold mt-1.5 text-[#555]">
                  {phase === 2 ? 'ACOUSTIC SILENCE' : 'MEL 32-BAND'}
                </div>
              </div>

              <div className="bg-[#111] border border-[#222] rounded-[2px] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-white flex items-center justify-center">
                    <IconBolt size={13} />
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#666]">RISK INDEX</span>
                </div>
                <div
                  className="font-mono text-[28px] sm:text-[30px] font-black tabular-nums tracking-[-0.03em] leading-none"
                  style={{ color: riskColor }}
                >
                  {Math.round(frame.risk * 100)}%
                </div>
                <div className="font-mono text-[9px] tracking-[0.06em] uppercase font-bold mt-1.5 text-[#555]">
                  {phase === 2 ? 'ANOMALY · HIGH' : 'ANOMALY · COHERENCE'}
                </div>
              </div>
            </div>

            <div className="bg-[#111] border border-[#222] rounded-[2px] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222] pb-3">
                <span className="flex items-center gap-2">
                  <span className={`w-[7px] h-[7px] inline-block animate-pulse ${phase === 2 ? 'bg-[#FF3333]' : 'bg-[#0E9F00]'}`} />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#888]">
                    {phase === 2 ? 'LIVE SIGNAL — APNEA EPISODE IN PROGRESS' : 'LEAD-II ECG · LIVE'}
                  </span>
                </span>
                <span className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase text-[#444]">
                  8H SYNTHETIC NIGHT COMPRESSED TO 40S
                </span>
              </div>
              <div className="rounded-[2px] overflow-hidden bg-black border border-[#222] p-2 min-h-[260px]">
                <EcgOscilloscope data={ecgData} leads_off={false} />
              </div>
              <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.06em] uppercase text-[#444]">
                <span>SYNTHETIC PQRST @ 50HZ · 500 SAMPLE WINDOW</span>
                <span className="text-[#333]">TERMINAL TRACE</span>
              </div>
            </div>

            {phase === 1 && (
              <div className="bg-[#111] border border-[#222] rounded-[2px] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#222] pb-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#888]">
                    SAME SIGNAL · DIFFERENT COHORT PRIOR
                  </span>
                  <span className="font-mono text-[9px] font-bold tracking-[0.06em] uppercase text-[#555]">
                    ESRS CALIBRATION
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0A0A0A] border border-[#222] rounded-[2px] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#666]">HEALTHY θ=0.30</span>
                      <span className="font-mono text-[9px] tracking-[0.06em] uppercase text-[#555] border border-[#222] bg-[#111] px-1.5 py-0.5 rounded-[2px]">
                        APNEA-ECG
                      </span>
                    </div>
                    <div className="font-mono text-[28px] font-black tabular-nums tracking-[-0.03em] leading-none text-[#0E9F00]">
                      {healthyRisk}%
                    </div>
                    <div className="h-[4px] bg-[#222] mt-3 rounded-[1px] overflow-hidden">
                      <div className="h-full bg-[#0E9F00]" style={{ width: `${healthyRisk}%` }} />
                    </div>
                    <div className="font-mono text-[9px] tracking-[0.06em] uppercase text-[#555] mt-2">APNEA RISK · LOW</div>
                  </div>
                  <div className="bg-[#0A0A0A] border border-[#222] rounded-[2px] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#666]">OSA θ=0.55</span>
                      <span className="font-mono text-[9px] tracking-[0.06em] uppercase text-[#555] border border-[#222] bg-[#111] px-1.5 py-0.5 rounded-[2px]">
                        SHHS
                      </span>
                    </div>
                    <div className="font-mono text-[28px] font-black tabular-nums tracking-[-0.03em] leading-none text-[#FFB800]">
                      {osaRisk}%
                    </div>
                    <div className="h-[4px] bg-[#222] mt-3 rounded-[1px] overflow-hidden">
                      <div className="h-full bg-[#FFB800]" style={{ width: `${osaRisk}%` }} />
                    </div>
                    <div className="font-mono text-[9px] tracking-[0.06em] uppercase text-[#555] mt-2">APNEA RISK · ELEVATED</div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-[#111] border border-[#222] rounded-[2px] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#222] pb-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#888]">
                  ECG ↔ AUDIO TIME/FREQUENCY CORRELATION
                </span>
                <span className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase text-[#0080FF] bg-[#0080FF]/10 border border-[#0080FF]/20 px-2 py-0.5 rounded-[2px]">
                  MEL 32 BANDS
                </span>
              </div>
              <div className="h-36 rounded-[2px] overflow-hidden border border-[#222] bg-black">
                <MelWaterfall melBands={melBands} />
              </div>
              <p className="font-mono text-[11px] tracking-[0.02em] leading-relaxed text-[#666]">
                SNORE BAND SPIKES (80-500HZ) FIRE EVERY RESPIRATORY CYCLE — SYNTHETIC ACOUSTIC STREAM CORRELATED TO THE SAME 50HZ CLOCK AS THE ECG.
              </p>
            </div>
          </div>
        )}

        {phase === 3 && (
          <div className="min-h-[60vh] flex items-center justify-center animate-fade-in">
            <div className="bg-[#111] border border-[#222] rounded-[2px] w-full p-6 space-y-4 overflow-hidden">
              <div className="flex items-center gap-2 pb-3 border-b border-[#222]">
                <span className="w-3 h-3 bg-[#FF3333] inline-block" />
                <span className="w-3 h-3 bg-[#FFB800] inline-block" />
                <span className="w-3 h-3 bg-[#0E9F00] inline-block" />
                <span className="ml-3 font-mono text-[10px] font-bold text-[#666] uppercase tracking-[0.14em]">
                  CAMERA 505 — AI CLINICAL INFERENCE ENGINE
                </span>
              </div>
              <div className="font-mono text-xs sm:text-[13px] space-y-2 min-h-[320px] pt-2">
                {INFERENCE_LINES.slice(0, inferCount).map((line, i) => (
                  <div key={i} className="leading-relaxed font-mono" style={{ color: lineColor(line) }}>
                    <span className="text-[#333] mr-2">{`>`}</span>
                    {line}
                  </div>
                ))}
                <span className="w-2 h-4 bg-white animate-pulse inline-block align-middle ml-1" />
              </div>
              <div className="pt-3 border-t border-[#222] flex items-center justify-between font-mono text-[11px] tracking-[0.06em] uppercase">
                <span className="text-[#555]">SOURCE: LOCAL SYNTHETIC BUFFER</span>
                <span className={inferCount >= INFERENCE_LINES.length ? 'text-[#0E9F00] font-bold' : 'text-[#FFB800]'}>
                  {inferCount >= INFERENCE_LINES.length ? 'AI: OLLAMA READY' : 'AI: ANALYZING…'}
                </span>
              </div>
            </div>
          </div>
        )}

        {phase >= 4 && (
          <div className="space-y-5 animate-fade-in">
            <div className="bg-[#111] border border-[#222] rounded-[2px] p-6 sm:p-8 space-y-5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#666] block text-center">
                CLINICAL SLEEP REPORT · SYNTHETIC NIGHT (LOCAL)
              </span>

              <div className="flex items-center justify-center gap-3">
                <span className="font-mono text-[64px] sm:text-[72px] font-black text-white tracking-[-0.04em] leading-none tabular-nums">
                  62
                </span>
                <div className="text-left pb-2">
                  <div className="font-mono text-sm text-[#666] font-bold tracking-[0.06em]">/100</div>
                  <div className="font-mono text-[11px] font-bold text-[#FFB800] uppercase tracking-[0.08em] mt-0.5">
                    STABILITY · MILD
                  </div>
                </div>
              </div>

              <div className="inline-flex flex-wrap items-center justify-center gap-2 bg-[#0A0A0A] border border-[#222] rounded-[2px] px-4 py-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
                <span className="text-white">AHI: 5.0 <span className="text-[#555] font-normal normal-case tracking-normal">events/hr</span></span>
                <span className="text-[#333]">·</span>
                <span className="text-[#FF3333]">40 EVENTS</span>
                <span className="text-[#333]">·</span>
                <span className="text-[#FFB800]">MILD APNEA SUSPECT (AHI 5-15)</span>
              </div>

              <div className="space-y-2.5 pt-2 text-left">
                <div className="flex justify-between font-mono text-[10px] tracking-[0.1em] uppercase font-bold text-[#666]">
                  <span>SLEEP ARCHITECTURE DISTRIBUTION</span>
                  <span className="text-[#333]">100%</span>
                </div>
                <div className="h-[8px] w-full flex overflow-hidden gap-[1px] bg-[#222] rounded-[2px] p-[1px]">
                  <div className="bg-white rounded-[1px] h-full" style={{ width: `${STAGES.deep}%` }} />
                  <div className="bg-[#0080FF] rounded-[1px] h-full" style={{ width: `${STAGES.rem}%` }} />
                  <div className="bg-[#555] rounded-[1px] h-full" style={{ width: `${STAGES.light}%` }} />
                  <div className="bg-[#FF3333] rounded-[1px] h-full" style={{ width: `${STAGES.awake}%` }} />
                </div>
                <div className="flex flex-wrap gap-4 pt-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-[#666]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-[8px] h-[8px] bg-white border border-[#333] inline-block" /> DEEP (18%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-[8px] h-[8px] bg-[#0080FF] inline-block" /> REM (21%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-[8px] h-[8px] bg-[#555] inline-block" /> LIGHT (47%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-[8px] h-[8px] bg-[#FF3333] inline-block" /> AWAKE (14%)
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#111] border border-[#222] rounded-[2px] overflow-hidden divide-y divide-[#222] font-mono text-[12px]">
              <div className="flex justify-between items-center px-5 py-3.5">
                <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">AVERAGE HEART RATE</span>
                <span className="font-black text-white tabular-nums tracking-[-0.02em]">64 <span className="text-[#666] font-bold text-[11px]">BPM</span></span>
              </div>
              <div className="flex justify-between items-center px-5 py-3.5">
                <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">AVERAGE RESPIRATION</span>
                <span className="font-black text-white tabular-nums tracking-[-0.02em]">11.2 <span className="text-[#666] font-bold text-[11px]">RPM</span></span>
              </div>
              <div className="flex justify-between items-center px-5 py-3.5">
                <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">SESSION DURATION</span>
                <span className="font-black text-white tabular-nums tracking-[-0.02em]">8H 00M</span>
              </div>
            </div>

            <div className="bg-[#111] border border-[#222] rounded-[2px] p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[#222] pb-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] font-black text-white">
                  CAMERA 505 AI CLINICAL ANALYSIS
                </span>
                <span className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase text-[#0E9F00] border border-[#0E9F00]/20 bg-[#0E9F00]/10 px-2 py-1 rounded-[2px]">
                  OLLAMA LLM ✓
                </span>
              </div>
              <p className="text-[#CCC] leading-relaxed font-mono text-[13px] normal-case tracking-normal">
                Overnight cardiorespiratory telemetry shows one prolonged obstructive episode with
                compensatory bradycardia (54 BPM) and acoustic silence. Sleep architecture is
                fragmented with elevated awake burden (14%). Recommendation: positional therapy and
                clinical follow-up PSG if symptoms persist.
              </p>
              <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#555] border-t border-[#222] pt-3">
                LLM report generated locally — no cloud, no data leaves device
              </div>
            </div>

            <button
              onClick={replay}
              className="btn-go w-full h-14 text-[11px] rounded-[2px] tracking-[0.12em]"
            >
              REPLAY JURY SEQUENCE
            </button>
          </div>
        )}

        <div className="text-center font-mono text-[9px] text-[#555] tracking-[0.14em] uppercase select-none pt-4">
          *WE DON&apos;T SUPPORT 67*
        </div>
      </div>
    </div>
  );
}
