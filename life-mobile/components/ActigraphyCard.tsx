"use client";

import { useEffect, useRef, useState } from "react";

const WINDOW_MS = 30_000;     // 30s actigraphy windows
const RECENT_MS = 3_000;      // live-state horizon
const V_STILL = 0.005;        // variance thresholds (m/s²)²
const V_RESTLESS = 0.16;
const KEEP_WINDOWS = 6;       // last 6 windows bar chart
const BAR_SCALE = 0.5;        // full-scale variance for bar height

type MotionState = "STILL" | "RESTLESS" | "ACTIVE";

const STATE_COLOR: Record<MotionState, string> = {
  STILL: "#0E9F00",
  RESTLESS: "#FFB800",
  ACTIVE: "#0080FF",
};

function classify(variance: number): MotionState {
  if (variance < V_STILL) return "STILL";
  if (variance < V_RESTLESS) return "RESTLESS";
  return "ACTIVE";
}

function varianceOf(vals: number[]): number {
  if (vals.length < 2) return 0;
  let m = 0;
  for (const v of vals) m += v;
  m /= vals.length;
  let s = 0;
  for (const v of vals) s += (v - m) * (v - m);
  return s / vals.length;
}

type DMEWithPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

export default function ActigraphyCard() {
  const [enabled, setEnabled] = useState(false);
  const [denied, setDenied] = useState(false);
  const [noSensor, setNoSensor] = useState(false);
  const [needsPermButton, setNeedsPermButton] = useState(false);
  const [current, setCurrent] = useState<MotionState | null>(null);
  const [windows, setWindows] = useState<{ variance: number; label: MotionState }[]>([]);
  const [windowSec, setWindowSec] = useState(0);

  const samplesRef = useRef<{ t: number; m: number }[]>([]);
  const windowStartRef = useRef(0);
  const handlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const DME = window.DeviceMotionEvent as unknown as DMEWithPermission | undefined;
      setNeedsPermButton(typeof DME?.requestPermission === "function");
    } catch {}
    return () => {
      if (handlerRef.current) window.removeEventListener("devicemotion", handlerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, []);

  const enable = async () => {
    try {
      const DME = window.DeviceMotionEvent as unknown as DMEWithPermission | undefined;
      if (typeof DME?.requestPermission === "function") {
        const res = await DME.requestPermission();
        if (res !== "granted") {
          setDenied(true);
          return;
        }
      }
    } catch {
      setDenied(true);
      return;
    }
    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity ?? e.acceleration;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      const now = Date.now();
      const s = samplesRef.current;
      s.push({ t: now, m });
      while (s.length && now - s[0].t > WINDOW_MS + 5000) s.shift();
    };
    handlerRef.current = handler;
    window.addEventListener("devicemotion", handler, { passive: true });
    windowStartRef.current = Date.now();
    samplesRef.current = [];
    setDenied(false);
    setNoSensor(false);
    setCurrent(null);
    setWindowSec(0);
    setEnabled(true);

    // If no motion events arrive at all, sensor is unavailable — honest state, no fake data
    watchdogRef.current = setTimeout(() => {
      if (samplesRef.current.length === 0) {
        disable();
        setNoSensor(true);
      }
    }, 4000);

    tickRef.current = setInterval(() => {
      const now = Date.now();
      const s = samplesRef.current.filter((x) => now - x.t <= WINDOW_MS);
      samplesRef.current = s;
      const recent = s.filter((x) => now - x.t <= RECENT_MS);
      if (recent.length >= 5) setCurrent(classify(varianceOf(recent.map((x) => x.m))));
      if (now - windowStartRef.current >= WINDOW_MS) {
        if (s.length >= 30) {
          const v = varianceOf(s.map((x) => x.m));
          setWindows((prev) => [...prev, { variance: v, label: classify(v) }].slice(-KEEP_WINDOWS));
        }
        samplesRef.current = [];
        windowStartRef.current = now;
        setWindowSec(0);
      } else {
        setWindowSec(Math.floor((now - windowStartRef.current) / 1000));
      }
    }, 1000);
  };

  const disable = () => {
    if (handlerRef.current) window.removeEventListener("devicemotion", handlerRef.current);
    handlerRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
    samplesRef.current = [];
    setEnabled(false);
    setCurrent(null);
    setWindowSec(0);
  };

  return (
    <div className="bg-[#111111] border border-[#222222] rounded-[2px] p-5 space-y-4">
      <div className="flex justify-between items-center pb-3 border-b border-[#222]">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-[2px] flex items-center justify-center font-mono text-xs font-black border ${enabled ? "bg-[#0E9F00]/10 text-[#0E9F00] border-[#0E9F00]/20" : "bg-[#0A0A0A] text-[#555] border-[#222]"}`}>
            {enabled ? "●" : "○"}
          </div>
          <div>
            <h4 className="font-mono text-[11px] font-black tracking-[0.06em] uppercase text-white">ACTIGRAPHY — PHONE ACCELEROMETER</h4>
            <p className="font-mono text-[11px] tracking-[0.04em] uppercase font-bold text-[#666]">30S MOTION-VARIANCE WINDOWS</p>
          </div>
        </div>
        <button
          onClick={enabled ? disable : enable}
          className={`px-4 py-2 rounded-[2px] font-mono text-[11px] font-black tracking-[0.06em] uppercase transition-colors cursor-pointer border ${
            enabled
              ? "bg-[#FF3333]/10 text-[#FF3333] border-[#FF3333]/30 hover:bg-[#FF3333] hover:text-white"
              : "bg-[#0080FF] text-white border-[#0080FF] hover:bg-[#0066CC] hover:border-[#0066CC]"
          }`}
        >
          {enabled ? "STOP" : "ENABLE MOTION"}
        </button>
      </div>

      {denied ? (
        <div className="font-mono text-[11px] font-black tracking-[0.06em] uppercase text-[#FF3333] bg-[#FF3333]/[0.06] border border-[#FF3333]/30 rounded-[2px] p-3 leading-relaxed">
          PERMISSION DENIED — ALLOW MOTION &amp; ORIENTATION ACCESS FOR ACTIGRAPHY
        </div>
      ) : noSensor ? (
        <div className="font-mono text-[11px] font-black tracking-[0.06em] uppercase text-[#FF3333] bg-[#FF3333]/[0.06] border border-[#FF3333]/30 rounded-[2px] p-3 leading-relaxed">
          NO MOTION DATA — DEVICE ACCELEROMETER UNAVAILABLE
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between font-mono">
            <span className="text-[10px] tracking-[0.08em] uppercase font-bold text-[#666]">CURRENT STATE</span>
            <span
              className="text-[16px] font-black tracking-[0.06em] uppercase tabular-nums"
              style={{ color: current ? STATE_COLOR[current] : "#555" }}
            >
              {current ?? "—"}
            </span>
          </div>

          <div className="flex items-end gap-1.5 h-16">
            {Array.from({ length: KEEP_WINDOWS }).map((_, i) => {
              const w = windows[i];
              const pct = w ? Math.min(100, Math.max(4, (w.variance / BAR_SCALE) * 100)) : 0;
              return (
                <div
                  key={i}
                  className="flex-1 h-full bg-[#222] rounded-[2px] flex flex-col justify-end overflow-hidden"
                  title={w ? `${w.label} · VAR ${w.variance.toFixed(3)} (m/s²)²` : "NO DATA"}
                >
                  <div
                    className="w-full rounded-[1px]"
                    style={{ height: `${pct}%`, background: w ? (w.label === "ACTIVE" ? "#0080FF" : "#FFFFFF") : "transparent" }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-between font-mono text-[9px] tracking-[0.06em] uppercase text-[#555] font-bold">
            <span>WINDOW {windowSec}/30S</span>
            <span>LAST 6 × 30S · VAR SCALE 0–0.5 (M/S²)²</span>
          </div>
        </div>
      )}

      <p className="font-mono text-[10px] tracking-[0.04em] uppercase font-bold text-[#555] leading-relaxed">
        |A| VARIANCE PER 30S WINDOW · STILL &lt; 0.005 · RESTLESS &lt; 0.16 · ACTIVE ≥ 0.16 · PHONE UNDER PILLOW OR ON MATTRESS
      </p>
    </div>
  );
}
