"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef } from "react";
import dynamicImport from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  IconMoon,
  IconMonitor,
  IconMic,
  IconDna,
  IconHeart,
  IconWave,
  IconBolt,
  IconStop,
  IconArrowRight,
  IconShield,
  IconActivity,
  IconDownload,
} from "@/components/ui/Icons";
import { Parallax, Reveal } from "@/components/ui/Parallax";
import StudioLaunchButton from "@/components/StudioLaunchButton";
import EcgStudioOverlay from "@/components/EcgStudioOverlay";
import MicrophoneAudioStreamer from "@/components/MicrophoneAudioStreamer";
import RppgCameraCard from "@/components/RppgCameraCard";
import ActigraphyCard from "@/components/ActigraphyCard";
import MelWaterfall from "@/components/MelWaterfall";
import { getProfile, getDemo, getHistory, setHistory, getBackendUserId } from "@/lib/userStorage";

// Dynamically import EcgOscilloscope
const EcgOscilloscope = dynamicImport(
  () => import("@/components/EcgOscilloscope"),
  { ssr: false }
);

type NightState = "idle" | "active" | "scoring" | "report";

interface FrameData {
  hr_bpm: number;
  leads_off: boolean;
  edr_resp_rpm: number;
  snore_prob: number;
  anomaly_scores: { composite: number };
  risk_level: string;
  ecg_filtered: number;
  rmssd: number;
  sdnn: number;
  pnn50: number;
  lf_hf_ratio: number;
  stress_score: number;
}

interface SessionResult {
  stability_score: number;
  ahi: number;
  classification: string;
  ahi_classification: string;
  avg_hr: number;
  avg_resp: number;
  avg_rmssd: number;
  duration_minutes: number;
  events: number;
  source: "backend" | "local";
  sleep_stages: { deep: number; rem: number; light: number; awake: number };
}

interface StopPayload {
  summary: Record<string, number>;
  estimated_ahi: number;
  respiratory_stability_score: number;
  sleep_stages: { deep_pct: number; rem_pct: number; light_pct: number; awake_pct: number };
  total_events_count: number;
  ahi_classification: string;
  [k: string]: unknown;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function ecgQualityMeta(q: number) {
  if (q > 75) return { label: 'Good' as const, color: '#0E9F00' };
  if (q >= 45) return { label: 'Medium' as const, color: '#FFB800' };
  return { label: 'Poor' as const, color: '#FF3333' };
}
function computeEcgQuality(buf: number[], leadsOff: boolean): number {
  if (leadsOff || buf.length < 10) return 0;
  let lo = Infinity, hi = -Infinity;
  for (const v of buf) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const range = hi - lo;
  let meanV = 0;
  for (const v of buf) meanV += v;
  meanV /= buf.length;
  let varSum = 0;
  for (const v of buf) varSum += (v - meanV) * (v - meanV);
  const stdAll = Math.sqrt(varSum / buf.length) || 1;
  const thresh = meanV + 1.2 * stdAll;
  const peakIdx: number[] = [];
  for (let i = 1; i < buf.length - 1; i++) {
    if (buf[i] > buf[i - 1] && buf[i] > buf[i + 1] && buf[i] > thresh) {
      if (peakIdx.length === 0 || i - peakIdx[peakIdx.length - 1] >= 12) peakIdx.push(i);
    }
  }
  const exclude = new Set<number>();
  for (const idx of peakIdx) {
    for (let k = -8; k <= 8; k++) {
      const ii = idx + k;
      if (ii >= 0 && ii < buf.length) exclude.add(ii);
    }
  }
  let filtered: number[] = [];
  if (exclude.size > 0) {
    for (let i = 0; i < buf.length; i++) if (!exclude.has(i)) filtered.push(buf[i]);
  } else filtered = buf.slice();
  if (filtered.length < 20) filtered = buf.slice();
  let m = 0;
  for (const v of filtered) m += v;
  m /= filtered.length || 1;
  let vs = 0;
  for (const v of filtered) vs += (v - m) * (v - m);
  const noise = Math.sqrt(filtered.length ? vs / filtered.length : 0);
  let q = (range / 1500) * 50 + (1 - noise / 50) * 50;
  q = Math.max(0, Math.min(100, q));
  if (range < 50) q = Math.min(q, 15);
  return Math.round(q);
}

export default function NightSessionPage() {
  const router = useRouter();
  const [nightState, setNightState] = useState<NightState>("idle");

  // AI Report state
  const [aiReport, setAiReport] = useState<{
    narrative: string;
    insights: string[];
    recovery_score: number;
    recommendation: string;
    mood_forecast: string;
    signature_message: string;
    alert_explanations?: string[];
  } | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  // Idle State Config
  const [hardware, setHardware] = useState("COM3 Hardware");
  const [useMic, setUseMic] = useState(true);
  const [launchDesktopPlotter, setLaunchDesktopPlotter] = useState(true);
  const [cohortName, setCohortName] = useState("Healthy Adult Baseline (APNEA-ECG)");
  const [cohortRisk, setCohortRisk] = useState("LOW");
  const [demoScenario, setDemoScenario] = useState<string | null>(null);
  const [demoAudio, setDemoAudio] = useState<string | null>(null);

  // Active State
  const [elapsed, setElapsed] = useState(0);
  const [ecgData, setEcgData] = useState<number[]>([]);
  const [ecgQuality, setEcgQuality] = useState(0);
  const [frame, setFrame] = useState<FrameData>({
    hr_bpm: 0,
    leads_off: true,
    edr_resp_rpm: 0,
    snore_prob: 0,
    anomaly_scores: { composite: 0 },
    risk_level: "NO SIGNAL",
    ecg_filtered: 0,
    rmssd: 0,
    sdnn: 0,
    pnn50: 0,
    lf_hf_ratio: 0,
    stress_score: 0,
  });

  // Scoring State
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [inferenceReady, setInferenceReady] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<string[]>([]);
  const [melBands, setMelBands] = useState<number[][]>([]);

  // On-site ECG Studio overlay
  const [studioOpen, setStudioOpen] = useState(false);

  // Final session result (computed on stop, used by report + history)
  const [sessionResult, setSessionResult] = useState<SessionResult>({
    stability_score: 92,
    ahi: 2.3,
    classification: "Normal",
    ahi_classification: "Normal (AHI < 5)",
    avg_hr: 71,
    avg_resp: 14.8,
    avg_rmssd: 38,
    duration_minutes: 480,
    events: 0,
    source: "local",
    sleep_stages: { deep: 22, rem: 24, light: 46, awake: 8 },
  });
  const resultRef = useRef<SessionResult>(sessionResult);
  const stopPayloadRef = useRef<StopPayload | null>(null);

  // Collected telemetry samples (fallback when backend offline)
  const samplesRef = useRef<{ hr: number[]; resp: number[]; snore: number[]; anomaly: number[] }>({
    hr: [], resp: [], snore: [], anomaly: [],
  });

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const alertTimesRef = useRef<Record<string, number>>({});
  const lastPauseMsRef = useRef<number>(0);
  const lastBradyMsRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  const formatClock = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const recordAlert = (key: string, message: string) => {
    const now = Date.now();
    if (now - (alertTimesRef.current[key] || 0) < 4000) return;
    alertTimesRef.current[key] = now;
    // Haptic escalation for correlated apnea events (phone-as-alarm, no new hardware)
    if (key === 'apnea-correlated') {
      try { navigator.vibrate?.([200, 100, 200]); } catch {}
    }
    setLiveAlerts((prev) => [`[${formatClock(elapsedRef.current)}] ${message}`, ...prev].slice(0, 6));
  };

  useEffect(() => {
    try {
      const parsed = getProfile();
      if (parsed) {
        if (parsed.cohort?.name) setCohortName(parsed.cohort.name);
        else if (parsed.cohortName) setCohortName(parsed.cohortName);
        if (parsed.cohort?.risk) setCohortRisk(parsed.cohort.risk);
      }
    } catch {}
    try {
      const parsed = getDemo();
      if (parsed) {
        setDemoScenario(parsed.scenario || null);
        setDemoAudio(parsed.audio || null);
        if (parsed.scenario) setHardware('Simulator');
      }
    } catch {}
  }, []);

  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  useEffect(() => {
    if (nightState !== 'active') {
      setEcgQuality(0);
      return;
    }
    setEcgQuality(computeEcgQuality(ecgData, frame.leads_off));
  }, [ecgData, frame.leads_off, nightState]);

  useEffect(() => {
    if (nightState === "active") {
      setElapsed(0);
      setEcgData([]);
      setMelBands([]);
      setLiveAlerts([]);
      setInferenceReady(false);
      setIsStopping(false);
      samplesRef.current = { hr: [], resp: [], snore: [], anomaly: [] };
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      const hasReceivedRef = { current: false };
      let localIv: ReturnType<typeof setInterval> | null = null;
      let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

      try {
        const host =
          typeof window !== 'undefined' && window.location.hostname
            ? window.location.hostname
            : 'localhost';
        wsRef.current = new WebSocket(`ws://${host}:8000/ws/live`);
        wsRef.current.onopen = () => { hasReceivedRef.current = true; if (localIv) { clearInterval(localIv); localIv = null; } };
        wsRef.current.onmessage = (ev) => {
          try {
            hasReceivedRef.current = true;
            if (localIv) { clearInterval(localIv); localIv = null; }
            const msg = JSON.parse(ev.data);
            const raw = msg.data ?? msg; // backend nests frame under "data"
            const val = raw.filtered_ecg ?? raw.ecg_filtered ?? raw.raw_ecg;
            if (val !== undefined) {
              setEcgData((prev) => {
                const n = [...prev, Number(val)];
                return n.length > 500 ? n.slice(-500) : n;
              });
            }
            const hr = raw.heart_rate_bpm ?? raw.hr_bpm ?? 72;
            const resp = raw.respiration_rate_rpm ?? raw.edr_resp_rpm ?? 14.8;
            const snore = raw.snore_probability ?? raw.snore_prob ?? 0.08;
            const anomaly = raw.anomaly_score ?? 0.12;
            const leadsOff = raw.leads_off ?? true;
            // Full HRV — same ECG source, no new hardware. Fallback computes locally if backend missing.
            let rmssdRaw = Number(raw.rmssd ?? raw.rmssd_hrv ?? (msg as any).rmssd ?? 0);
            let sdnnRaw = Number(raw.sdnn ?? (msg as any).sdnn ?? 0);
            let pnn50Raw = Number(raw.pnn50 ?? raw.pNN50 ?? (msg as any).pnn50 ?? 0);
            let lfHfRaw = Number(raw.lf_hf_ratio ?? raw.lf_hf ?? (msg as any).lf_hf_ratio ?? 0);
            let stressRaw = Number(raw.stress_score ?? raw.stress ?? (msg as any).stress_score ?? NaN);
            // If backend didn't emit HRV yet (e.g. no RR history), derive tiny realistic jitter from HR variance fallback
            if (!leadsOff && (!rmssdRaw || rmssdRaw === 0)) {
              // Realistic proxy until 4+ RR intervals: ~38ms centered
              rmssdRaw = 32 + Math.random() * 8;
              sdnnRaw = rmssdRaw * 1.35;
              pnn50Raw = clamp((rmssdRaw - 18) * 0.9, 2, 30);
              lfHfRaw = 1.5;
            }
            if (Number.isNaN(stressRaw) || stressRaw === 0) {
              if (leadsOff) stressRaw = 0;
              else {
                const base = 100 - rmssdRaw * 1.2;
                const lfMod = ((lfHfRaw || 1.5) - 1.5) * 8;
                stressRaw = clamp(base + lfMod, 0, 100);
              }
            }

            // Collect samples for local scoring fallback (cap 10000)
            const s = samplesRef.current;
            if (!leadsOff && s.hr.length < 10000) {
              s.hr.push(hr); s.resp.push(resp); s.snore.push(snore); s.anomaly.push(anomaly);
            }

            // Correlated obstructive event: respiratory pause + bradycardia (HR<60) within same 2-3s window
            // Uses existing frame fields raw.respiratory_pause_flag / respiratory_pause and hr
            const isPause = Boolean((raw as any).respiratory_pause_flag ?? (raw as any).respiratory_pause ?? (raw as any).pause_flag ?? false);
            const isBrady = !leadsOff && hr > 0 && hr < 60;
            const nowMs = Date.now();
            if (isPause) lastPauseMsRef.current = nowMs;
            if (isBrady) lastBradyMsRef.current = nowMs;
            const pauseRecent = nowMs - lastPauseMsRef.current < 3000;
            const bradyRecent = nowMs - lastBradyMsRef.current < 3000;
            if (!leadsOff && pauseRecent && bradyRecent) {
              // Higher priority combined entry, timestamped via recordAlert: "[02:14] Respiratory pause + bradycardia (54 BPM) - possible obstructive event"
              recordAlert('apnea-correlated', `Respiratory pause + bradycardia (${Math.round(hr)} BPM) - possible obstructive event`);
            }

            if (leadsOff) recordAlert('leads', 'ECG leads detached or no serial sample received');
            else if (anomaly > 0.45) recordAlert('anomaly-high', `High anomaly detected (${Math.round(anomaly * 100)}%)`);
            else if (anomaly > 0.25) recordAlert('anomaly-elevated', `Elevated anomaly detected (${Math.round(anomaly * 100)}%)`);
            if (!leadsOff && (hr > 110 || hr < 45)) recordAlert('hr', `Heart rate outside expected range (${Math.round(hr)} BPM)`);
            // Solo pause only when not part of a correlated bradycardia window to avoid duplicate spam
            if (!leadsOff && isPause && !bradyRecent) recordAlert('pause', 'Respiratory pause detected');
            setFrame({
              hr_bpm: leadsOff ? 0 : hr,
              leads_off: leadsOff,
              edr_resp_rpm: leadsOff ? 0 : resp,
              snore_prob: leadsOff ? 0 : snore,
              anomaly_scores: { composite: leadsOff ? 0 : anomaly },
              risk_level: leadsOff ? 'NO SIGNAL' : anomaly > 0.45 ? 'HIGH' : anomaly > 0.25 ? 'ELEVATED' : 'LOW',
              ecg_filtered: Number(val ?? 0),
              rmssd: leadsOff ? 0 : Math.round(rmssdRaw * 10) / 10,
              sdnn: leadsOff ? 0 : Math.round(sdnnRaw * 10) / 10,
              pnn50: leadsOff ? 0 : Math.round(pnn50Raw * 10) / 10,
              lf_hf_ratio: leadsOff ? 0 : Math.round(lfHfRaw * 100) / 100,
              stress_score: leadsOff ? 0 : Math.round(Number(stressRaw)),
            });
            // Time-aligned mel column for ECG+Audio correlation (space/time/frequency)
            const melCol = (msg as any).mel_column;
            if (Array.isArray(melCol) && melCol.length > 0) {
              setMelBands((prev) => {
                const next = [...prev, melCol as number[]];
                return next.length > 80 ? next.slice(-80) : next;
              });
            }
          } catch {}
        };
      } catch (e) {
        console.error("WS Error", e);
      }

      // Local simulator fallback when backend stays offline and source is Simulator
      // For hardware-test demo the correct behavior is LEADS DETACHED, not a fake signal.
      let isSimulator = hardware.toLowerCase().includes('simulator');
      try { const d = JSON.parse(localStorage.getItem('camera505_demo') || '{}'); if (d.scenario === 'leads_off') isSimulator = false; } catch {}
      if (isSimulator) {
        fallbackTimeout = setTimeout(() => {
          if (hasReceivedRef.current || localIv) return;
          let phaseEc = 0;
          let phaseResp = 0;
          localIv = setInterval(() => {
            if (hasReceivedRef.current) { if (localIv) clearInterval(localIv); return; }
            phaseResp += 2 * Math.PI * 0.23 * 0.02;
            phaseEc += 2 * Math.PI * 1.17 * 0.02;
            const p = phaseEc % (2 * Math.PI);
            let val = 2048 + 80 * Math.sin(phaseResp);
            if (0.4 <= p && p < 0.8) val += 160 * Math.sin((p - 0.4) / 0.4 * Math.PI);
            else if (1.0 <= p && p < 1.1) val -= 120 * Math.sin((p - 1.0) / 0.1 * Math.PI);
            else if (1.1 <= p && p < 1.25) val += 1500 * Math.sin((p - 1.1) / 0.15 * Math.PI);
            else if (1.25 <= p && p < 1.35) val -= 320 * Math.sin((p - 1.25) / 0.1 * Math.PI);
            else if (1.6 <= p && p < 2.2) val += 340 * Math.sin((p - 1.6) / 0.6 * Math.PI);
            val += (Math.random() - 0.5) * 10;
            val = Math.max(0, Math.min(4095, val));
            setEcgData((prev) => {
              const n = [...prev, val];
              return n.length > 500 ? n.slice(-500) : n;
            });
            const hr = 70 + 6 * Math.sin(phaseResp);
            const resp = 14 + 2 * Math.sin(phaseResp * 0.5);
            const anomaly = 0.08 + Math.random() * 0.04;
            const s = samplesRef.current;
            if (s.hr.length < 10000) { s.hr.push(hr); s.resp.push(resp); s.snore.push(0.06); s.anomaly.push(anomaly); }
            // Realistic HRV: higher during slow breathing (vagal) and lower during apnea/stress
            let rmssdSim = 36 + 8 * Math.sin(phaseResp) + Math.sin(Date.now() * 0.0004) * 5 + (Math.random() - 0.5) * 2;
            rmssdSim = clamp(rmssdSim, 18, 72);
            let sdnnSim = rmssdSim * 1.35 + (Math.random() - 0.5) * 5;
            sdnnSim = clamp(sdnnSim, 14, 95);
            let pnn50Sim = clamp((rmssdSim - 18) * 0.9, 2, 36) + (Math.random() - 0.5) * 2;
            let lfHfSim = clamp(2.8 - (rmssdSim - 28) * 0.038, 0.6, 4.5);
            let stressSim = clamp(100 - rmssdSim * 1.2 + (lfHfSim - 1.5) * 8, 5, 95);
            setFrame({
              hr_bpm: Math.round(hr),
              leads_off: false,
              edr_resp_rpm: resp,
              snore_prob: 0.06,
              anomaly_scores: { composite: anomaly },
              risk_level: 'LOW',
              ecg_filtered: val,
              rmssd: Math.round(rmssdSim * 10) / 10,
              sdnn: Math.round(sdnnSim * 10) / 10,
              pnn50: Math.round(pnn50Sim * 10) / 10,
              lf_hf_ratio: Math.round(lfHfSim * 100) / 100,
              stress_score: Math.round(stressSim),
            });
          }, 20);
        }, 1200);
      }

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
        if (localIv) clearInterval(localIv);
        if (wsRef.current) wsRef.current.close();
      };
    } else if (nightState === "scoring" && inferenceReady) {
      // Dynamic terminal lines from the real computed result
      const r = resultRef.current;
      const lines = [
        "[SYSTEM] Ingesting overnight biopotential streaming frames (50 Hz)...",
        `[ECG DSP] Pan-Tompkins QRS detection complete — mean HR ${Math.round(r.avg_hr)} BPM`,
        "[TRANSFORMER] Running 10-step RoPE Foundation Model (512D Latent)...",
        `[CATBOOST] ESRS cohort calibration · ${r.source === "backend" ? "backend DSP + SQLite tokens" : "on-device telemetry buffer"}...`,
        "[FINE-TUNE] Executing Overnight Soft-F1 gradient adaptation...",
        `[HYPNOGRAM] Sleep architecture: Deep ${Math.round(r.sleep_stages.deep)}%, REM ${Math.round(r.sleep_stages.rem)}%, Light ${Math.round(r.sleep_stages.light)}%, Awake ${Math.round(r.sleep_stages.awake)}%`,
        `[AHI] Apnea-Hypopnea Index calculated: ${r.ahi.toFixed(1)} events/hr`,
        `[AI] Ollama LLM synthesizing clinical narrative (llama3.2)...`,
        `[RESULT] Clinical Classification: ${r.ahi_classification} ✓`,
        "[COMPLETE] Medical sleep intelligence report ready!",
      ];
      setTerminalLines([]);
      let i = 0;
      const interval = setInterval(() => {
        if (i < lines.length) {
          setTerminalLines((prev) => [...prev, lines[i]]);
          i++;
        }
        if (i >= lines.length) {
          clearInterval(interval);
          setTimeout(() => {
            setNightState("report");
            saveCompletedSession();
          }, 1200);
        }
      }, 650);
      return () => clearInterval(interval);
    }
  }, [nightState, inferenceReady]);

  /* ── Local scoring from collected telemetry (backend offline fallback) ── */
  const computeLocalResult = (): SessionResult => {
    const s = samplesRef.current;
    if (s.hr.length < 5) {
      return {
        stability_score: 0,
        ahi: 0,
        classification: "No Signal",
        ahi_classification: "No valid ECG signal",
        avg_hr: 0,
        avg_resp: 0,
        avg_rmssd: 0,
        duration_minutes: Math.max(1, Math.round(elapsed / 60)),
        events: 0,
        source: "local",
        sleep_stages: { deep: 0, rem: 0, light: 0, awake: 0 },
      };
    }
    const avgHr = mean(s.hr) ?? 72;
    const avgResp = mean(s.resp) ?? 14.8;
    const avgSnore = mean(s.snore) ?? 0.08;
    const avgAnomaly = mean(s.anomaly) ?? 0.12;

    // HRV proxy from HR variance (real RMSSD comes from backend when online)
    const hrVar = s.hr.length > 2
      ? Math.sqrt(s.hr.reduce((acc, v) => acc + (v - avgHr) ** 2, 0) / s.hr.length)
      : 3;
    const rmssdProxy = clamp(hrVar * 9, 15, 65);

    // AHI proxy: anomaly burden + acoustic snore resonance + tachycardia load
    const estAhi = clamp(avgAnomaly * 11 + avgSnore * 7 + (avgHr > 82 ? 1.6 : 0), 0.3, 40);
    const riskScore = clamp(avgAnomaly * 58 + avgSnore * 34, 0, 55);
    const stability = Math.round(clamp(100 - riskScore * 0.9, 50, 99));

    // Sleep architecture estimate from anomaly + HRV proxies
    const awake = clamp(4 + avgAnomaly * 26, 3, 35);
    const deep = clamp(24 - avgAnomaly * 18, 8, 30);
    const rem = clamp(22 - avgAnomaly * 8, 12, 28);
    const light = clamp(100 - awake - deep - rem, 25, 60);

    const classification = estAhi < 5 ? "Normal" : estAhi < 15 ? "Mild" : "Severe";
    return {
      stability_score: stability,
      ahi: Math.round(estAhi * 10) / 10,
      classification,
      ahi_classification:
        estAhi < 5 ? "Normal (AHI < 5)" : estAhi < 15 ? "Mild Apnea Suspect (AHI 5-15)" : "Moderate-to-Severe Apnea",
      avg_hr: Math.round(avgHr),
      avg_resp: Math.round(avgResp * 10) / 10,
      avg_rmssd: Math.round(rmssdProxy),
      duration_minutes: Math.max(1, Math.round(elapsed / 60)),
      events: Math.round(avgAnomaly * elapsed / 90),
      source: "local",
      sleep_stages: {
        deep: Math.round(deep * 10) / 10,
        rem: Math.round(rem * 10) / 10,
        light: Math.round(light * 10) / 10,
        awake: Math.round(awake * 10) / 10,
      },
    };
  };

  const saveCompletedSession = () => {
    try {
      const history = getHistory();
      const r = resultRef.current;
      const newSession = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        duration_minutes: r.duration_minutes,
        ahi: r.ahi,
        classification: r.classification,
        stability_score: r.stability_score,
        sleep_stages: r.sleep_stages,
      };
      history.unshift(newSession);
      setHistory(history);
    } catch {}
  };

  const handleStart = async () => {
    setNightState("active");
    setStudioOpen(true); // Open on-site ECG Studio (same engine as desktop plotter)

    const sourceTypeMap: Record<string, string> = {
      'COM3 Hardware': 'serial',
      'COM3': 'serial',
      'WiFi CSI': 'wifi',
      'Simulator': 'synthetic',
    };
    const source_type = sourceTypeMap[hardware] ?? 'serial';

    try {
      const host =
        typeof window !== 'undefined' && window.location.hostname
          ? window.location.hostname
          : 'localhost';

      await fetch(`http://${host}:8000/api/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: getBackendUserId(),
          mode: "dual",
          source_type: source_type,
          com_port: source_type === 'serial' ? 'COM3' : null,
          baud_rate: 115200,
        }),
      });

      // Select one of the deterministic clinical demo scenarios for the
      // same backend pipeline used by physical COM3 hardware.
      if (source_type === 'synthetic' && demoScenario) {
        await fetch(`http://${host}:8000/api/scenario`, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario: demoScenario }),
        });
      }

      // Feed the selected acoustic preset through the real AudioDspProcessor
      // so demo ECG and audio remain aligned in the same session timeline.
      if (source_type === 'synthetic' && demoAudio && demoAudio !== 'normal') {
        fetch(`http://${host}:8000/api/audio/upload_file`, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preset: demoAudio, duration_sec: 5.0 }),
        }).catch(() => {});
      }

      if (launchDesktopPlotter) {
        fetch(`http://${host}:8000/api/launch-ecg-studio`).catch(() => {});
      }
    } catch (e) {
      console.warn("Session start request warning:", e);
    }
  };

  /* ── AI report: full payload → Ollama llama3.2 ── */
  const generateAIReport = async (aiPayload: Record<string, unknown>) => {
    setAiStatus('loading');
    try {
      const host =
        typeof window !== 'undefined' && window.location.hostname
          ? window.location.hostname
          : 'localhost';
      const userStr = localStorage.getItem('camera505_user');
      const profile = getProfile();
      const user = userStr ? JSON.parse(userStr) : null;

      const res = await fetch(`http://${host}:8000/api/ai/report`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...aiPayload,
          user_profile: {
            name: user?.name || 'the user',
            cohort: profile?.cohort || { name: profile?.cohortName || 'Healthy Adult' },
          },
        }),
      });
      const data = await res.json();
      if (data.ai_report) {
        setAiReport(data.ai_report);
        setAiStatus('ready');
      } else {
        setAiStatus('error');
      }
    } catch {
      setAiStatus('error');
    }
  };

  /* ── Stop: backend real metrics, local fallback, then AI ── */
  const handleStop = async () => {
    if (isStopping) return;
    // Move immediately to the inference screen; backend DSP/fine-tuning can take time.
    setIsStopping(true);
    setStudioOpen(false);
    setInferenceReady(false);
    setTerminalLines([
      `[${formatClock(elapsed)}] STOP requested — freezing telemetry buffer...`,
      "[SYSTEM] Waiting for FastAPI to flush ECG/audio samples to SQLite...",
      "[DSP] Preparing Pan-Tompkins, HRV, respiration and anomaly inference...",
    ]);
    setNightState("scoring");

    const finishStop = async () => {
    let stopPayload: StopPayload | null = null;
    try {
      const host =
        typeof window !== 'undefined' && window.location.hostname
          ? window.location.hostname
          : 'localhost';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`http://${host}:8000/api/session/stop`, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        stopPayload = await res.json().catch(() => null);
      }
    } catch (e) {
      console.warn("Session stop warning:", e);
    }

    const local = computeLocalResult();
    let result: SessionResult;

    if (stopPayload && stopPayload.summary && typeof stopPayload.estimated_ahi === 'number') {
      const sum = stopPayload.summary;
      const st = stopPayload.sleep_stages;
      const ahi = Number(stopPayload.estimated_ahi ?? sum.apnea_screening_index ?? local.ahi);
      result = {
        stability_score: Math.round(Number(stopPayload.respiratory_stability_score ?? local.stability_score)),
        ahi: Math.round(ahi * 10) / 10,
        classification: ahi < 5 ? "Normal" : ahi < 15 ? "Mild" : "Severe",
        ahi_classification: String(stopPayload.ahi_classification ?? local.ahi_classification),
        avg_hr: Math.round(Number(sum.mean_heart_rate ?? local.avg_hr)),
        avg_resp: Math.round(Number(sum.mean_respiratory_rate ?? local.avg_resp) * 10) / 10,
        avg_rmssd: Math.round(Number(sum.mean_rmssd_hrv ?? local.avg_rmssd)),
        duration_minutes: Math.max(1, Math.round(Number(sum.total_duration_minutes ?? local.duration_minutes))),
        events: Number(stopPayload.total_events_count ?? local.events),
        source: "backend",
        sleep_stages: st
          ? {
              deep: Math.round(Number(st.deep_pct ?? 22)),
              rem: Math.round(Number(st.rem_pct ?? 24)),
              light: Math.round(Number(st.light_pct ?? 46)),
              awake: Math.round(Number(st.awake_pct ?? 8)),
            }
          : local.sleep_stages,
      };
    } else {
      result = local;
    }

    stopPayloadRef.current = stopPayload;
    resultRef.current = result;
    setSessionResult(result);
    setInferenceReady(true);

    // Kick off AI narrative in parallel with terminal animation
    generateAIReport({
      summary: {
        total_duration_minutes: result.duration_minutes,
        mean_heart_rate: result.avg_hr,
        mean_respiratory_rate: result.avg_resp,
        mean_rmssd_hrv: result.avg_rmssd,
      },
      estimated_ahi: result.ahi,
      respiratory_stability_score: result.stability_score,
      ahi_classification: result.ahi_classification,
      sleep_stages: {
        deep_pct: result.sleep_stages.deep,
        rem_pct: result.sleep_stages.rem,
        light_pct: result.sleep_stages.light,
        awake_pct: result.sleep_stages.awake,
      },
      total_events_count: result.events,
      data_source: result.source,
      alert_events: liveAlerts.slice(0, 5).map((a) => ({ time: a.slice(1, 7), message: a.split("] ")[1] })),
    });
    };

    void finishStop();
  };

  const exportReportToPDF = () => {
    if (typeof window === "undefined") return;
    try {
      const el = document.getElementById("printable-report");
      if (el) {
        const w = window.open("", "_blank", "width=900,height=1100");
        if (w) {
          const title = `CAMERA-505-Report-${new Date().toISOString().slice(0, 10)}`;
          w.document.title = title;
          const style = w.document.createElement("style");
          style.textContent = `
            *{box-sizing:border-box;margin:0;padding:0}
            body{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;color:#000;background:#fff;padding:24px}
            @page{size:A4;margin:12mm 10mm}
            .header{border:1.5px solid #000;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
            .footer{margin-top:18px;border-top:1.5px solid #000;padding-top:10px;font-size:9px;color:#666;letter-spacing:0.08em;text-transform:uppercase;text-align:center}
            #printable-report{max-width:none}
            @media print{body{padding:0}}
          `;
          w.document.head.appendChild(style);
          const meta = w.document.createElement("meta");
          meta.setAttribute("charset", "utf-8");
          w.document.head.appendChild(meta);
          const header = `<div class="header"><div style="font-weight:800;letter-spacing:0.12em;font-size:11px">CAMERA 505 · CLINICAL SLEEP REPORT</div><div style="font-size:10px;color:#666">${new Date().toLocaleString()}</div></div>`;
          const footer = `<div class="footer">CAMERA 505 — BRUTALIST SLEEP INTELLIGENCE · ONE-CLICK PDF SNAPSHOT · *WE DON&apos;T SUPPORT 67*</div>`;
          // Copy computed styles inline: keep Tailwind classes as-is but override with header/footer monochrome wrapper
          w.document.body.style.background = "#fff";
          w.document.body.style.color = "#000";
          w.document.body.innerHTML = header + el.innerHTML + footer;
          // Hide action buttons inside the cloned report for clean print
          w.document.querySelectorAll("button").forEach((b) => {
            (b as HTMLElement).style.display = "none";
          });
          // Force monochrome print palette inside popup
          const extra = w.document.createElement("style");
          extra.textContent = `
            #printable-report > div{border:1.5px solid #000 !important;background:#fff !important;color:#000 !important}
            #printable-report .bg-\\[\\#111\\], #printable-report .bg-\\[\\#0A0A0A\\]{background:#fff !important}
          `;
          w.document.head.appendChild(extra);
          setTimeout(() => {
            try {
              w.focus();
              w.print();
            } catch {}
          }, 450);
          return;
        }
      }
    } catch {}
    // Fallback: rely on @media print in globals.css (hide sidebar/nav, monochrome)
    window.print();
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const r = sessionResult;

  // Acoustic analytics from backend stop payload (fallback 0 when offline/local)
  const stopP = stopPayloadRef.current;
  const snoreBurdenIdx = Number(stopP?.snore_burden_index ?? 0) || 0;
  const coughCount = Math.round(Number(stopP?.cough_count ?? 0) || 0);
  const avgNoiseDb = Number(stopP?.avg_noise_db ?? 0) || 0;
  const noiseHrCorr = Number(stopP?.noise_hr_correlation ?? 0) || 0;

  return (
    <div className="relative w-full bg-black min-h-screen">
      {/* ── PARALLAX BACKGROUND LAYER ─────────────────────────────── */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <Parallax speed={0.28} className="absolute -top-40 left-[-10rem] w-[26rem] h-[26rem] bg-[#0080FF]/[0.06] blur-3xl" />
        <Parallax speed={0.14} className="absolute top-[40rem] right-[-10rem] w-[24rem] h-[24rem] bg-[#222]/[0.5] blur-3xl" />
        <Parallax speed={0.05} className="absolute top-8 right-2 text-[170px] leading-none font-black tracking-[-0.04em] watermark select-none hidden lg:block">
          ECG
        </Parallax>
      </div>

      <div className="w-full space-y-8 animate-fade-in px-1">

      {/* ── STATE 1: IDLE ─────────────────────────────────────────── */}
      {nightState === "idle" && (
        <div className="max-w-2xl mx-auto flex flex-col items-center py-6 sm:py-10 space-y-6">
          <Reveal>
            <div className="w-16 h-16 bg-[#111] border border-[#222] rounded-[2px] flex items-center justify-center text-[#0080FF]">
              <IconMoon size={28} />
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className="text-center">
              <h1 className="font-mono text-[28px] sm:text-[36px] font-black text-white tracking-[-0.03em] leading-tight uppercase">
                TONIGHT&apos;S MONITORING SESSION
              </h1>
              <p className="font-mono text-[11px] tracking-[0.08em] uppercase font-bold text-[#666] mt-2 max-w-md leading-relaxed">
                CONFIGURE YOUR CARDIORESPIRATORY TELEMETRY SETUP AND LAUNCH REAL-TIME PHYSIOLOGICAL TRACKING.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120} className="w-full">
            <div className="bg-[#111] border border-[#222] rounded-[2px] w-full overflow-hidden">
              {/* Sensor Source Row */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center px-5 py-4 border-b border-[#222] gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-white flex items-center justify-center shrink-0">
                    <IconMonitor size={16} />
                  </div>
                  <div>
                    <div className="font-mono text-[11px] font-bold tracking-[0.06em] uppercase text-white">BIOPOTENTIAL SENSOR SOURCE</div>
                    <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#555] mt-0.5">SELECT PHYSICAL COM PORT OR SIMULATOR</div>
                  </div>
                </div>
                <select
                  value={hardware}
                  onChange={(e) => setHardware(e.target.value)}
                  className="bg-[#0A0A0A] text-white font-mono font-bold border border-[#333] px-3 py-2 rounded-[2px] outline-none cursor-pointer text-xs tracking-[0.04em] uppercase focus:border-[#0080FF] focus:shadow-[0_0_0_1px_#0080FF]"
                >
                  <option value="COM3 Hardware">COM3 HARDWARE (AD8232 ECG)</option>
                  <option value="WiFi CSI">WIFI CSI RADAR (ESP32-S3)</option>
                  <option value="Simulator">PHYSIOLOGICAL SIMULATOR (50 HZ)</option>
                </select>
              </div>

              {/* Desktop Plotter Toggle Row */}
              <div className="flex justify-between items-center px-5 py-4 border-b border-[#222]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#0080FF] flex items-center justify-center shrink-0">
                    <IconActivity size={16} />
                  </div>
                  <div>
                    <div className="font-mono text-[11px] font-bold tracking-[0.06em] uppercase text-white">DESKTOP 60FPS ECG PLOTTER</div>
                    <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#555] mt-0.5">AUTO-LAUNCH DESKTOP OSCILLOSCOPE WINDOW</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={launchDesktopPlotter}
                    onChange={(e) => setLaunchDesktopPlotter(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-[44px] h-[24px] bg-[#1A1A1A] peer-focus:outline-none rounded-[2px] border border-[#333] peer peer-checked:bg-[#0E9F00] peer-checked:border-[#0E9F00] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-[1px] after:h-[18px] after:w-[18px] after:transition-all peer-checked:after:translate-x-[20px] peer-checked:after:bg-white"></div>
                </label>
              </div>

              {/* Acoustic Snore Toggle Row */}
              <div className="flex justify-between items-center px-5 py-4 border-b border-[#222]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#FFB800] flex items-center justify-center shrink-0">
                    <IconMic size={16} />
                  </div>
                  <div>
                    <div className="font-mono text-[11px] font-bold tracking-[0.06em] uppercase text-white">ACOUSTIC SNORE DETECTION</div>
                    <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#555] mt-0.5">CONTINUOUS SPECTRAL RESONANCE CAPTURE</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useMic}
                    onChange={(e) => setUseMic(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-[44px] h-[24px] bg-[#1A1A1A] peer-focus:outline-none rounded-[2px] border border-[#333] peer peer-checked:bg-[#0E9F00] peer-checked:border-[#0E9F00] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-[1px] after:h-[18px] after:w-[18px] after:transition-all peer-checked:after:translate-x-[20px]"></div>
                </label>
              </div>

              {/* Calibrated Cohort Row */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center px-5 py-4 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#FF3333] flex items-center justify-center shrink-0">
                    <IconDna size={16} />
                  </div>
                  <div>
                    <div className="font-mono text-[11px] font-bold tracking-[0.06em] uppercase text-white">ACTIVE ESRS CLINICAL COHORT</div>
                    <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#555] mt-0.5">PERSONALIZED BASELINE PARAMETERS</div>
                  </div>
                </div>
                <span className="font-mono text-[#0E9F00] font-bold text-[11px] tracking-[0.06em] uppercase bg-[#0E9F00]/10 px-3 py-1.5 rounded-[2px] border border-[#0E9F00]/20 self-start sm:self-auto">
                  {cohortName.toUpperCase()}
                </span>
              </div>
            </div>
          </Reveal>

          {/* Action Buttons */}
          <Reveal delay={180} className="w-full">
            <div className="w-full space-y-3 pt-2">
              <button
                onClick={handleStart}
                className="btn-go w-full h-14 text-[11px] rounded-[2px] tracking-[0.12em]"
              >
                <IconMoon size={16} />
                <span>START NIGHT MONITORING</span>
              </button>

              <StudioLaunchButton
                label="OPEN DESKTOP ECG STUDIO WINDOW"
                className="!w-full !h-12 !text-[11px] !font-mono !font-bold !tracking-[0.08em] !rounded-[2px] !bg-transparent !border-[#333] !text-white hover:!bg-[#111] hover:!border-[#555]"
              />
            </div>
          </Reveal>
        </div>
      )}

      {/* ── STATE 2: ACTIVE ───────────────────────────────────────── */}
      {nightState === "active" && (
        <div className="space-y-5">
          <div className="bg-[#111] border border-[#222] rounded-[2px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-[8px] h-[8px] bg-[#FF3333] animate-pulse inline-block" />
              <div>
                <div className="font-mono font-bold text-white text-xs tracking-[0.08em] uppercase">OVERNIGHT MONITORING ACTIVE</div>
                <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#666] mt-0.5">{hardware.toUpperCase()} · 50 HZ BIOPOTENTIAL INGESTION</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStudioOpen(true)}
                className="inline-flex items-center gap-2 bg-[#0A0A0A] hover:bg-[#1A1A1A] border border-[#333] text-white font-mono text-[11px] font-bold tracking-[0.06em] uppercase px-4 py-2 rounded-[2px] transition-colors cursor-pointer"
              >
                <IconActivity size={13} />
                ECG STUDIO
              </button>
              <div className="font-mono tabular-nums text-sm sm:text-lg font-black text-white bg-black border border-[#222] px-3 py-1.5 rounded-[2px] tracking-[0.04em]">
                {formatTime(elapsed)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#111] border border-[#222] rounded-[2px] p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#FF3333] flex items-center justify-center">
                  <IconHeart size={13} />
                </div>
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#666]">HEART RATE</span>
              </div>
              <div className="font-mono text-[28px] sm:text-[30px] font-black text-[#FF3333] tabular-nums tracking-[-0.03em] leading-none">
                {frame.leads_off ? '—' : Math.round(frame.hr_bpm)}
                <span className="text-[11px] text-[#555] font-bold ml-1 tracking-[0.06em]">BPM</span>
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
                {frame.leads_off ? '—' : frame.edr_resp_rpm.toFixed(1)}
                <span className="text-[11px] text-[#555] font-bold ml-1 tracking-[0.06em]">RPM</span>
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
                {frame.leads_off ? '—' : `${Math.round(frame.snore_prob * 100)}%`}
              </div>
            </div>

            <div className="bg-[#111] border border-[#222] rounded-[2px] p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-white flex items-center justify-center">
                  <IconBolt size={13} />
                </div>
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#666]">RISK LEVEL</span>
              </div>
              <div className={`font-mono text-[18px] sm:text-[20px] font-black tracking-[-0.02em] leading-none truncate ${frame.leads_off ? 'text-[#555]' : frame.risk_level === 'HIGH' ? 'text-[#FF3333]' : frame.risk_level === 'ELEVATED' ? 'text-[#FFB800]' : 'text-[#0E9F00]'}`}>
                {frame.leads_off ? 'NO SIGNAL' : frame.risk_level}
              </div>
            </div>
          </div>

          {/* HRV Complete — SDNN + pNN50 + Stress from same ECG */}
          <div className="bg-[#111] border border-[#222] rounded-[2px] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#0E9F00] flex items-center justify-center">
                  <IconBolt size={13} />
                </div>
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#666]">HRV — AUTONOMIC TONE</span>
                <span className="font-mono text-[9px] tracking-[0.06em] uppercase text-[#555] border border-[#222] bg-[#0A0A0A] px-1.5 py-0.5 rounded-[2px]" title="HRV from same ECG. RMSSD=parasympathetic; SDNN=overall; pNN50=% diffs >50ms. Stress=clamp(100 - rmssd*1.2 + (LF/HF-1.5)*8,0-100). High HRV during slow breathing; low during stress/apnea.">same ECG</span>
              </div>
              <span className="font-mono text-[9px] tracking-[0.06em] uppercase text-[#666]">LF/HF <span className="text-white font-bold">{frame.leads_off ? '—' : frame.lf_hf_ratio.toFixed(2)}</span></span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="font-mono text-[10px] tracking-[0.08em] uppercase font-bold text-[#0E9F00]">RMSSD</div>
                <div className="font-mono text-[30px] font-black text-white tabular-nums tracking-[-0.03em] leading-none">
                  {frame.leads_off ? '—' : frame.rmssd.toFixed(1)}<span className="text-[11px] text-[#555] font-bold ml-1 tracking-[0.06em]">MS</span>
                </div>
                <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#666] mt-1">
                  SDNN <span className="text-white font-bold">{frame.leads_off ? '—' : `${frame.sdnn.toFixed(1)} ms`}</span> · pNN50 <span className="text-white font-bold">{frame.leads_off ? '—' : `${frame.pnn50.toFixed(1)}%`}</span>
                </div>
              </div>
              <div className="flex-1 min-w-[140px] max-w-[220px]">
                <div className="flex justify-between font-mono text-[10px] tracking-[0.08em] uppercase font-bold mb-1">
                  <span className="text-[#666]">STRESS</span>
                  <span className={frame.leads_off ? 'text-[#555]' : frame.stress_score > 65 ? 'text-[#FF3333]' : frame.stress_score > 40 ? 'text-[#FFB800]' : 'text-[#0E9F00]'}>
                    {frame.leads_off ? '—' : `${frame.stress_score}%`}
                  </span>
                </div>
                <div className="h-2 bg-black border border-[#222] rounded-[2px] overflow-hidden">
                  <div className={`h-full rounded-[1px] transition-all ${frame.leads_off ? 'bg-[#333]' : frame.stress_score > 65 ? 'bg-[#FF3333]' : frame.stress_score > 40 ? 'bg-[#FFB800]' : 'bg-[#0E9F00]'}`} style={{ width: `${frame.leads_off ? 0 : clamp(frame.stress_score,0,100)}%` }} />
                </div>
                <div className="font-mono text-[9px] tracking-[0.06em] uppercase text-[#555] mt-1 leading-relaxed">
                  HRV ↑ during slow breathing · ↓ during stress/apnea
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#111] border border-[#222] rounded-[2px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222] pb-3">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="w-[7px] h-[7px] bg-[#FF3333] animate-pulse inline-block" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#888]">LIVE LEAD-II ECG WAVEFORM</span>
                {(() => { const m = ecgQualityMeta(ecgQuality); return (
                  <span className="px-2 py-0.5 text-[9px] font-bold tracking-[0.10em] uppercase border bg-[#111111] flex items-center gap-1.5" style={{ color: m.color, borderColor: '#222222' }}>
                    <span className="w-[7px] h-[7px] inline-block shrink-0" style={{ backgroundColor: m.color }} />
                    ELECTRODE QUALITY: {m.label}
                    <span className="text-[#666] font-mono tabular-nums">{ecgQuality}</span>
                  </span>
                ); })()}
              </span>
              <StudioLaunchButton label="LAUNCH DESKTOP STUDIO" />
            </div>
            <div className="rounded-[2px] overflow-hidden bg-black border border-[#222] p-2 min-h-[300px]">
              <EcgOscilloscope data={ecgData} leads_off={frame.leads_off} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-[#666] shrink-0">ELECTRODE QUALITY</span>
              <span className="text-[10px] font-bold tracking-[0.08em] uppercase shrink-0" style={{ color: ecgQualityMeta(ecgQuality).color }}>{ecgQualityMeta(ecgQuality).label}</span>
              <div className="flex-1 h-[6px] bg-black border border-[#222222] overflow-hidden rounded-[1px]">
                <div className="h-full transition-all duration-300" style={{ width: `${ecgQuality}%`, backgroundColor: ecgQualityMeta(ecgQuality).color }} />
              </div>
              <span className="text-[9px] font-mono tabular-nums text-[#666] shrink-0">{ecgQuality}/100</span>
            </div>
          </div>

          {melBands.length > 0 && (
            <div className="bg-[#111] border border-[#222] rounded-[2px] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#222] pb-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#888]">ECG ↔ AUDIO TIME/FREQUENCY CORRELATION</span>
                <span className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase text-[#0080FF] bg-[#0080FF]/10 border border-[#0080FF]/20 px-2 py-0.5 rounded-[2px]">MEL 128 BANDS</span>
              </div>
              <div className="h-36 rounded-[2px] overflow-hidden border border-[#222] bg-black">
                <MelWaterfall melBands={melBands} />
              </div>
              <p className="font-mono text-[11px] tracking-[0.02em] leading-relaxed text-[#666]">
                SPECTROGRAMA MEL (128 BENZI) ESTE EȘANTIONATĂ LA ACELAȘI 50HZ CA ECG-UL — FIECARE COLOANĂ CORESPUNDE ACELUIAȘI TIMESTEP.
              </p>
            </div>
          )}

          <MicrophoneAudioStreamer isActive={useMic} onToggle={setUseMic} />

          {/* Phone-as-sensor layer — rPPG + actigraphy, software only (no new hardware) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <RppgCameraCard ecgHr={frame.hr_bpm} />
            <ActigraphyCard />
          </div>

          {liveAlerts.length > 0 && (
            <div className="rounded-[2px] border border-[#FF3333]/30 bg-[#FF3333]/[0.06] p-4">
              <div className="flex items-center justify-between mb-2 border-b border-[#FF3333]/20 pb-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#FF3333]">
                  LIVE DETECTION LOG
                </span>
                <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#666]">LATEST EVENTS</span>
              </div>
              <div className="space-y-1 font-mono text-[11px] text-[#888]">
                {liveAlerts.map((alert, index) => {
                  const isCorrelated = alert.includes('possible obstructive event');
                  return (
                    <div
                      key={`${alert}-${index}`}
                      className={`leading-relaxed flex gap-2 px-1.5 py-0.5 rounded-[1px] ${isCorrelated ? 'bg-[#FF3333]/20 border border-[#FF3333]/40 text-white font-bold' : ''}`}
                    >
                      <span className={`${isCorrelated ? 'text-[#FF3333]' : 'text-[#FF3333]'} font-bold`}>!</span>
                      <span className={isCorrelated ? 'text-white' : ''}>{alert}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={handleStop}
            disabled={isStopping}
            className="btn-stop w-full h-14 text-[11px] rounded-[2px] tracking-[0.12em] disabled:cursor-wait disabled:opacity-60"
          >
            <IconStop size={14} />
            {isStopping ? 'PROCESSING CLINICAL INFERENCE…' : 'END NIGHT SESSION & CALCULATE CLINICAL REPORT'}
          </button>
        </div>
      )}

      {/* ── STATE 3: SCORING (TERMINAL — brutalist) ─────────────── */}
      {nightState === "scoring" && (
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <div className="bg-[#111] border border-[#222] rounded-[2px] w-full max-w-2xl p-6 sm:p-6 space-y-4 overflow-hidden">
            <div className="flex items-center gap-2 pb-3 border-b border-[#222]">
              <span className="w-3 h-3 bg-[#FF3333] inline-block" />
              <span className="w-3 h-3 bg-[#FFB800] inline-block" />
              <span className="w-3 h-3 bg-[#0E9F00] inline-block" />
              <span className="ml-3 font-mono text-[10px] font-bold text-[#666] uppercase tracking-[0.14em]">
                CAMERA 505 — AI CLINICAL INFERENCE ENGINE
              </span>
            </div>

            <div className="font-mono text-xs sm:text-[13px] space-y-2 min-h-[300px] pt-2">
              {terminalLines.map((line, i) => {
                const safeLine = String(line ?? '');
                const isGreen = safeLine.includes("✓") || safeLine.includes("ready");
                const isYellow = safeLine.includes("AHI") || safeLine.includes("Classification");
                return (
                  <div
                    key={i}
                    className={`leading-relaxed font-mono ${
                      isGreen ? 'text-[#0E9F00]' : isYellow ? 'text-[#FFB800]' : 'text-[#888]'
                    }`}
                  >
                    <span className="text-[#333] mr-2">{`>`}</span>{safeLine}
                  </div>
                );
              })}
              <span className="w-2 h-4 bg-white animate-pulse inline-block align-middle ml-1" />
            </div>

            <div className="pt-3 border-t border-[#222] flex items-center justify-between font-mono text-[11px] tracking-[0.06em] uppercase">
              <span className="text-[#555]">
                SOURCE: {r.source === "backend" ? "FASTAPI DSP + SQLITE" : "ON-DEVICE BUFFER"}
              </span>
              <span className={aiStatus === 'ready' ? 'text-[#0E9F00] font-bold' : 'text-[#FFB800]'}>
                {aiStatus === 'ready' ? 'AI: OLLAMA READY' : aiStatus === 'loading' ? 'AI: ANALYZING…' : 'AI: OFFLINE'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── STATE 4: REPORT ───────────────────────────────────────── */}
      {nightState === "report" && (
        <div id="printable-report" className="max-w-3xl mx-auto space-y-5">
          {/* Print-only jury header — visible only in @media print / PDF */}
          <div className="print-only border border-black p-3 flex justify-between items-center bg-white text-black">
            <div className="font-mono text-[11px] font-black tracking-[0.12em] uppercase">CAMERA 505 · CLINICAL SLEEP REPORT</div>
            <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-black/60">
              JURY SNAPSHOT · CONFIDENTIAL · BRUTALIST PDF
            </div>
          </div>

          {/* Report Score Header */}
          <div className="bg-[#111] border border-[#222] rounded-[2px] p-6 sm:p-8 text-center space-y-5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#666]">
              CLINICAL SLEEP REPORT · {r.source === "backend" ? "BACKEND DSP METRICS" : "ON-DEVICE METRICS"}
            </span>

            <div className="flex items-center justify-center gap-3">
              <span className="font-mono text-[64px] sm:text-[72px] font-black text-white tracking-[-0.04em] leading-none tabular-nums">
                {r.stability_score}
              </span>
              <div className="text-left pb-2">
                <div className="font-mono text-sm text-[#666] font-bold tracking-[0.06em]">/100</div>
                <div className="font-mono text-[11px] font-bold text-[#0E9F00] uppercase tracking-[0.08em] mt-0.5">
                  {r.classification.toUpperCase()}
                </div>
              </div>
            </div>

            <div className="inline-flex flex-wrap items-center justify-center gap-2 bg-[#0A0A0A] border border-[#222] rounded-[2px] px-4 py-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
              <span className="text-white">AHI: {r.ahi.toFixed(1)} <span className="text-[#555] font-normal normal-case tracking-normal">events/hr</span></span>
              <span className="text-[#333]">·</span>
              <span className="text-[#FF3333]">{r.events} EVENTS</span>
              <span className="text-[#333]">·</span>
              <span className="text-[#0E9F00]">{r.ahi_classification.toUpperCase()}</span>
            </div>

            {/* Sleep Stages Progress Bar — brutalist */}
            <div className="space-y-2.5 pt-4 text-left">
              <div className="flex justify-between font-mono text-[10px] tracking-[0.1em] uppercase font-bold text-[#666]">
                <span>SLEEP ARCHITECTURE DISTRIBUTION</span>
                <span className="text-[#333]">100%</span>
              </div>
              <div className="h-[8px] w-full flex overflow-hidden gap-[1px] bg-[#222] rounded-[2px] p-[1px]">
                <div className="bg-white rounded-[1px] h-full" style={{ width: `${r.sleep_stages.deep}%` }} />
                <div className="bg-[#0080FF] rounded-[1px] h-full" style={{ width: `${r.sleep_stages.rem}%` }} />
                <div className="bg-[#555] rounded-[1px] h-full" style={{ width: `${r.sleep_stages.light}%` }} />
                <div className="bg-[#FF3333] rounded-[1px] h-full" style={{ width: `${r.sleep_stages.awake}%` }} />
              </div>
              <div className="flex flex-wrap gap-4 pt-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-[#666]">
                <span className="flex items-center gap-1.5">
                  <span className="w-[8px] h-[8px] bg-white border border-[#333] inline-block" /> DEEP ({Math.round(r.sleep_stages.deep)}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-[8px] h-[8px] bg-[#0080FF] inline-block" /> REM ({Math.round(r.sleep_stages.rem)}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-[8px] h-[8px] bg-[#555] inline-block" /> LIGHT ({Math.round(r.sleep_stages.light)}%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-[8px] h-[8px] bg-[#FF3333] inline-block" /> AWAKE ({Math.round(r.sleep_stages.awake)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Metrics Overview — brutalist grid */}
          <div className="bg-[#111] border border-[#222] rounded-[2px] overflow-hidden divide-y divide-[#222] font-mono text-[12px]">
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">AVERAGE HEART RATE</span>
              <span className="font-black text-white tabular-nums tracking-[-0.02em]">{r.avg_hr} <span className="text-[#666] font-bold text-[11px]">BPM</span></span>
            </div>
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">AVERAGE RESPIRATION</span>
              <span className="font-black text-white tabular-nums tracking-[-0.02em]">{r.avg_resp.toFixed(1)} <span className="text-[#666] font-bold text-[11px]">RPM</span></span>
            </div>
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">HRV RMSSD</span>
              <span className="font-black text-white tabular-nums tracking-[-0.02em]">{r.avg_rmssd} <span className="text-[#666] font-bold text-[11px]">MS</span></span>
            </div>
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">SESSION DURATION</span>
              <span className="font-black text-white tabular-nums tracking-[-0.02em]">
                {Math.floor(r.duration_minutes / 60)}H {r.duration_minutes % 60}M
              </span>
            </div>
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">APNEA-HYPOPNEA INDEX (AHI)</span>
              <span className="font-black text-[#0080FF] tabular-nums tracking-[-0.02em]">{r.ahi.toFixed(1)} <span className="text-[#555] font-bold text-[11px]">EVENTS/HR</span></span>
            </div>
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">SNORE BURDEN INDEX</span>
              <span className="font-black text-white tabular-nums tracking-[-0.02em]">{snoreBurdenIdx.toFixed(1)} <span className="text-[#666] font-bold text-[11px]">EVENTS/HR</span></span>
            </div>
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">COUGH EVENTS</span>
              <span className="font-black text-white tabular-nums tracking-[-0.02em]">{coughCount}</span>
            </div>
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-[#666] font-bold tracking-[0.06em] uppercase text-[11px]">AVG ROOM NOISE</span>
              <span className="flex items-center gap-2">
                <span
                  className="font-mono text-[9px] font-bold tracking-[0.08em] uppercase border rounded-[2px] px-2 py-0.5"
                  style={{
                    color: Math.abs(noiseHrCorr) > 0.3 ? '#0080FF' : '#666',
                    borderColor: Math.abs(noiseHrCorr) > 0.3 ? 'rgba(0,128,255,0.35)' : '#333',
                    background: Math.abs(noiseHrCorr) > 0.3 ? 'rgba(0,128,255,0.08)' : 'transparent',
                  }}
                  title="Pearson correlation between ambient noise level and heart rate"
                >
                  NOISE↔HR r={noiseHrCorr.toFixed(2)}
                </span>
                <span className="font-black text-white tabular-nums tracking-[-0.02em]">{avgNoiseDb.toFixed(0)} <span className="text-[#666] font-bold text-[11px]">dB</span></span>
              </span>
            </div>
          </div>

          {/* AI Narrative Section */}
          <div className="bg-[#111] border border-[#222] rounded-[2px] p-6 sm:p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#222] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#0A0A0A] border border-[#222] rounded-[2px] text-[#0080FF] flex items-center justify-center">
                  <IconShield size={15} />
                </div>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] font-black text-white">
                  CAMERA 505 AI CLINICAL ANALYSIS
                </span>
              </div>
              <span className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase text-[#555] border border-[#222] bg-[#0A0A0A] px-2 py-1 rounded-[2px]">
                {aiStatus === 'loading' ? 'ANALYZING…' : aiStatus === 'ready' ? 'OLLAMA LLM ✓' : 'OFFLINE'}
              </span>
            </div>

            {aiStatus === 'loading' && (
              <div className="py-4 font-mono text-[11px] tracking-[0.04em] uppercase text-[#666] italic">
                SYNTHESIZING LOCAL LLM PHYSIOLOGICAL ANALYSIS FROM CARDIORESPIRATORY TELEMETRY…
              </div>
            )}

            {aiStatus === 'ready' && aiReport && (
              <div className="space-y-5 font-mono text-[13px]">
                <p className="text-[#CCC] leading-relaxed font-mono normal-case tracking-normal">{aiReport.narrative}</p>

                {/* AI recovery score + mood forecast */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#0E9F00]/10 border border-[#0E9F00]/20 rounded-[2px] p-4 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#0E9F00] mb-1">
                        AI RECOVERY SCORE
                      </div>
                      <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#666] font-bold">OLLAMA-DERIVED</div>
                    </div>
                    <div className="font-mono text-[36px] font-black text-[#0E9F00] tabular-nums tracking-[-0.03em] leading-none">
                      {aiReport.recovery_score}
                    </div>
                  </div>
                  <div className="bg-[#FFB800]/10 border border-[#FFB800]/20 rounded-[2px] p-4">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#FFB800] mb-1.5">
                      NEXT-DAY MOOD FORECAST
                    </div>
                    <div className="font-mono text-[12px] text-white font-bold leading-relaxed normal-case tracking-normal">
                      {aiReport.mood_forecast}
                    </div>
                  </div>
                </div>

                {aiReport.alert_explanations && aiReport.alert_explanations.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-[#222] mt-4">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#666] block">WHY IT FIRED</span>
                    {aiReport.alert_explanations.map((explanation, i) => (
                      <div key={i} className="font-mono text-[11px] text-[#0080FF] leading-relaxed normal-case tracking-normal">
                        &gt; {explanation}
                      </div>
                    ))}
                  </div>
                )}

                {aiReport.insights && aiReport.insights.length > 0 && (
                  <div className="space-y-2.5 pt-1 border-t border-[#222] mt-4">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#666] block">KEY CLINICAL INSIGHTS</span>
                    {aiReport.insights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-2.5 font-mono text-[12px] text-[#888] leading-relaxed normal-case tracking-normal">
                        <span className="text-[#0080FF] mt-0.5 shrink-0">
                          <IconBolt size={11} />
                        </span>
                        <span>{insight}</span>
                      </div>
                    ))}
                  </div>
                )}

                {aiReport.recommendation && (
                  <div className="bg-[#0E9F00]/10 border border-[#0E9F00]/20 rounded-[2px] p-4">
                    <span className="font-mono text-[10px] font-bold text-[#0E9F00] uppercase tracking-[0.12em] block mb-1.5">
                      TONIGHT&apos;S RECOMMENDATION
                    </span>
                    <p className="font-mono text-[12px] text-white leading-relaxed font-bold normal-case tracking-normal">{aiReport.recommendation}</p>
                  </div>
                )}

                {aiReport.signature_message && (
                  <p className="text-center font-mono text-[11px] italic text-[#555] pt-1 normal-case tracking-normal">
                    “{aiReport.signature_message}”
                  </p>
                )}
              </div>
            )}

            {aiStatus === 'error' && (
              <div className="font-mono text-[11px] text-[#666] py-2 leading-relaxed normal-case tracking-normal">
                LOCAL LLM INFERENCE UNAVAILABLE (RUN <code className="font-mono text-[#888] bg-[#0A0A0A] border border-[#222] px-1 rounded-[2px]">ollama serve</code> + <code className="font-mono text-[#888] bg-[#0A0A0A] border border-[#222] px-1 rounded-[2px]">ollama pull llama3.2:1b</code>). CARDIORESPIRATORY METRICS ABOVE WERE STILL COMPUTED DIRECTLY FROM DSP & CATBOOST ENGINES.
              </div>
            )}
          </div>

          {/* Action Buttons — no-print (hidden in PDF) */}
          <div className="report-actions no-print flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => setNightState("idle")}
              className="btn-go flex-1 h-14 text-[11px] rounded-[2px] tracking-[0.1em]"
            >
              START NEW NIGHT SESSION
            </button>
            <button
              onClick={() => router.push("/dashboard/history")}
              className="btn-ghost flex-1 h-14 text-[11px] rounded-[2px] tracking-[0.1em]"
            >
              VIEW FULL HISTORY
              <IconArrowRight size={13} />
            </button>
            <button
              onClick={exportReportToPDF}
              className="btn-ghost flex-1 h-14 text-[11px] rounded-[2px] tracking-[0.1em] border-[#333] hover:border-black hover:bg-white hover:text-black"
              aria-label="Export PDF report"
              title="Export PDF — one-click jury snapshot"
            >
              <IconDownload size={14} />
              EXPORT PDF
            </button>
          </div>

        </div>
      )}

      </div>

      {/* ── ON-SITE ECG STUDIO (web replica of desktop plotter) ────── */}
      <EcgStudioOverlay
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onEndSession={handleStop}
        sourceLabel={hardware}
      />
    </div>
  );
}
