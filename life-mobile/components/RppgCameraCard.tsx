"use client";

import { useEffect, useRef, useState } from "react";

const FPS = 10;            // center-pixel sampling rate
const BUF_LEN = 300;       // 30s ring buffer @ 10fps
const LP_WIN = 3;          // ~3.3 Hz low-pass (moving average)
const HP_WIN = 15;         // ~0.7 Hz high-pass (moving average diff)
const WAVE_POINTS = 150;   // 15s waveform display
const MIN_PEAK_GAP = 3;    // 3.5 Hz max heart rate
const MAX_PEAK_GAP = 21;   // ~0.5 Hz min heart rate

// Moving average with sliding window sum
function movingAvg(src: number[], win: number): number[] {
  const out: number[] = new Array(src.length);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= win) sum -= src[i - win];
    out[i] = sum / Math.min(i + 1, win);
  }
  return out;
}

// Bandpass = short-MA (low-pass) minus long-MA of it (high-pass) → 0.7–3.5 Hz
function bandpass(raw: number[]): number[] {
  const lp = movingAvg(raw, LP_WIN);
  const hp = movingAvg(lp, HP_WIN);
  return lp.map((v, i) => v - hp[i]);
}

function estimateBpm(bp: number[]): number | null {
  if (bp.length < 80) return null;
  let m = 0;
  for (const v of bp) m += v;
  m /= bp.length;
  let varSum = 0;
  for (const v of bp) varSum += (v - m) * (v - m);
  const thresh = m + Math.sqrt(varSum / bp.length) * 0.4;
  const peaks: number[] = [];
  for (let i = 1; i < bp.length - 1; i++) {
    if (bp[i] > thresh && bp[i] >= bp[i - 1] && bp[i] > bp[i + 1]) {
      if (!peaks.length || i - peaks[peaks.length - 1] >= MIN_PEAK_GAP) peaks.push(i);
    }
  }
  if (peaks.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const g = peaks[i] - peaks[i - 1];
    if (g <= MAX_PEAK_GAP) gaps.push(g);
  }
  if (gaps.length < 2) return null;
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  const bpm = (60 * FPS) / med;
  return bpm >= 42 && bpm <= 210 ? bpm : null;
}

interface Props {
  ecgHr?: number;
}

export default function RppgCameraCard({ ecgHr = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bufRef = useRef<number[]>([]);

  const [running, setRunning] = useState(false);
  const [denied, setDenied] = useState(false);
  const [bpm, setBpm] = useState<number | null>(null);
  const [redMean, setRedMean] = useState(0);

  const drawWave = (bp: number[]) => {
    const canvas = waveRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    if (bp.length < 2) return;
    const slice = bp.slice(-WAVE_POINTS);
    let lo = Infinity, hi = -Infinity;
    for (const v of slice) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; }
    const pad = (hi - lo) * 0.2;
    lo -= pad; hi += pad;
    const yOf = (v: number) => h - ((v - lo) / (hi - lo)) * h;
    ctx.beginPath();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const n = slice.length;
    for (let i = 0; i < n; i++) {
      const x = w - ((n - 1 - i) / WAVE_POINTS) * w;
      if (i === 0) ctx.moveTo(x, yOf(slice[i]));
      else ctx.lineTo(x, yOf(slice[i]));
    }
    ctx.stroke();
  };

  const tick = () => {
    const video = videoRef.current;
    const sc = sampleCanvasRef.current;
    if (!video || !sc || video.readyState < 2) return;
    const ctx = sc.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    try {
      ctx.drawImage(video, 0, 0, sc.width, sc.height);
      const half = 8;
      const cx = sc.width >> 1;
      const cy = sc.height >> 1;
      const img = ctx.getImageData(cx - half, cy - half, half * 2, half * 2).data;
      let r = 0;
      for (let i = 0; i < img.length; i += 4) r += img[i];
      r /= img.length / 4;
      bufRef.current.push(r);
      if (bufRef.current.length > BUF_LEN) bufRef.current = bufRef.current.slice(-BUF_LEN);
      setRedMean(Math.round(r));
      const bp = bandpass(bufRef.current);
      setBpm(estimateBpm(bp.slice(-200)));
      drawWave(bp);
    } catch {}
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      bufRef.current = [];
      setBpm(null);
      setDenied(false);
      setRunning(true);
      intervalRef.current = setInterval(tick, 1000 / FPS);
    } catch {
      setDenied(true);
      setRunning(false);
    }
  };

  const stop = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
    bufRef.current = [];
    setRunning(false);
    setBpm(null);
    setRedMean(0);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const delta = running && bpm != null && ecgHr > 0 ? Math.abs(Math.round(bpm) - Math.round(ecgHr)) : null;

  return (
    <div className="bg-[#111111] border border-[#222222] rounded-[2px] p-5 space-y-4">
      <div className="flex justify-between items-center pb-3 border-b border-[#222]">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-[2px] flex items-center justify-center font-mono text-xs font-black border ${running ? "bg-[#0E9F00]/10 text-[#0E9F00] border-[#0E9F00]/20" : "bg-[#0A0A0A] text-[#555] border-[#222]"}`}>
            {running ? "●" : "○"}
          </div>
          <div>
            <h4 className="font-mono text-[11px] font-black tracking-[0.06em] uppercase text-white">RPPG PULSE — FINGER ON LENS</h4>
            <p className="font-mono text-[11px] tracking-[0.04em] uppercase font-bold text-[#666]">CROSS-VALIDATE WITH AD8232</p>
          </div>
        </div>
        <button
          onClick={running ? stop : start}
          className={`px-4 py-2 rounded-[2px] font-mono text-[11px] font-black tracking-[0.06em] uppercase transition-colors cursor-pointer border ${
            running
              ? "bg-[#FF3333]/10 text-[#FF3333] border-[#FF3333]/30 hover:bg-[#FF3333] hover:text-white"
              : "bg-[#0080FF] text-white border-[#0080FF] hover:bg-[#0066CC] hover:border-[#0066CC]"
          }`}
        >
          {running ? "STOP" : "START"}
        </button>
      </div>

      {denied ? (
        <div className="font-mono text-[11px] font-black tracking-[0.06em] uppercase text-[#FF3333] bg-[#FF3333]/[0.06] border border-[#FF3333]/30 rounded-[2px] p-3 leading-relaxed">
          PERMISSION DENIED — ALLOW CAMERA ACCESS TO RUN RPPG
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <video
              ref={videoRef}
              muted
              autoPlay
              playsInline
              className="w-16 h-12 object-cover bg-black border border-[#222] rounded-[2px]"
            />
            <span className="font-mono text-[9px] tracking-[0.06em] uppercase text-[#555] font-bold">
              R-CH {running ? redMean : "—"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-mono text-[30px] font-black text-white tabular-nums tracking-[-0.03em] leading-none">
                {bpm != null ? Math.round(bpm) : "—"}
                <span className="text-[11px] text-[#555] font-bold ml-1 tracking-[0.06em]">BPM</span>
              </span>
              {delta != null && (
                <span
                  className={`font-mono text-[10px] font-black tracking-[0.06em] uppercase px-2 py-1 rounded-[2px] border ${
                    delta <= 5
                      ? "text-[#0E9F00] border-[#0E9F00]/30 bg-[#0E9F00]/10"
                      : delta <= 10
                        ? "text-[#FFB800] border-[#FFB800]/30 bg-[#FFB800]/10"
                        : "text-[#FF3333] border-[#FF3333]/30 bg-[#FF3333]/10"
                  }`}
                >
                  Δ {delta} BPM vs Lead-II
                </span>
              )}
            </div>
            <div className="h-16 bg-black border border-[#222] rounded-[2px] overflow-hidden">
              <canvas ref={waveRef} className="w-full h-full block" />
            </div>
          </div>
        </div>
      )}

      <p className="font-mono text-[10px] tracking-[0.04em] uppercase font-bold text-[#555] leading-relaxed">
        COVER REAR CAMERA WITH FINGERTIP · RED-CHANNEL MEAN @ 10 HZ · BANDPASS 0.7–3.5 HZ (MOVING-AVERAGE DIFF)
      </p>

      <canvas ref={sampleCanvasRef} width={64} height={48} className="hidden" />
    </div>
  );
}
