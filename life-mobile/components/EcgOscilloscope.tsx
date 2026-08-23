"use client";

import { useRef, useEffect, useCallback } from "react";

const WINDOW = 500;
const TRACE_COLOR = "#0E9F00";   // terminal green trace — brutalist
const GRID_COLOR  = "rgba(255, 255, 255, 0.05)";
const AXIS_COLOR  = "rgba(255, 255, 255, 0.10)";
const BG_COLOR    = "#000000";
const HEAD_COLOR  = "#FF3333";   // Red leading dot — brutalist danger

interface Props {
  data: number[];
  leads_off?: boolean;
}

export default function EcgOscilloscope({ data, leads_off = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  // Smoothed autoscale range (prevents jumpy/random-looking trace starts)
  const rangeRef  = useRef<{ lo: number; hi: number }>({ lo: 0.4, hi: 0.6 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // HiDPI sharpness
    if (canvas.width !== Math.floor(canvas.offsetWidth * dpr) ||
        canvas.height !== Math.floor(canvas.offsetHeight * dpr)) {
      canvas.width  = Math.floor(canvas.offsetWidth * dpr);
      canvas.height = Math.floor(canvas.offsetHeight * dpr);
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    // Clean clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Subtle medical grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = (i / 6) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let j = 0; j <= 12; j++) {
      const x = (j / 12) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // Isoelectric baseline
    ctx.strokeStyle = AXIS_COLOR;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.setLineDash([]);

    if (leads_off) {
      ctx.fillStyle = "rgba(255, 51, 51, 0.06)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#FF3333";
      ctx.font = `700 ${Math.max(11, w / 38)}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ELECTRODES DETACHED — PLACE 3 PADS ON SKIN", w / 2, h / 2);
      return;
    }

    if (data.length < 2) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(14, 159, 0, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    const slice = data.slice(-WINDOW);

    // Normalize samples to 0..1 (12-bit ADC or normalized float)
    const norms: number[] = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      const v = slice[i];
      norms[i] = v > 10.0 ? v / 4095.0 : (v + 1.5) / 3.0;
    }

    // Smoothed autoscale (EMA) — stable window instead of jumping on every beat
    let lo = Infinity, hi = -Infinity;
    for (const n of norms) { if (n < lo) lo = n; if (n > hi) hi = n; }
    if (hi - lo < 0.02) { hi += 0.01; lo -= 0.01; }
    const pad = (hi - lo) * 0.18;
    const targetLo = Math.max(0, lo - pad);
    const targetHi = Math.min(1, hi + pad);
    const k = 0.08; // smoothing factor
    rangeRef.current.lo += (targetLo - rangeRef.current.lo) * k;
    rangeRef.current.hi += (targetHi - rangeRef.current.hi) * k;
    const rLo = rangeRef.current.lo;
    const rHi = rangeRef.current.hi;
    const scale = (n: number) => h - ((n - rLo) / (rHi - rLo)) * h;

    // Right-anchored scrolling trace: latest sample always at the right edge
    // (like a real patient monitor — no random left-side starts)
    ctx.beginPath();
    ctx.strokeStyle = TRACE_COLOR;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowBlur = 6;
    ctx.shadowColor = "rgba(14, 159, 0, 0.35)";

    const n = norms.length;
    for (let i = 0; i < n; i++) {
      const x = w - ((n - 1 - i) / WINDOW) * w;
      const y = scale(norms[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Red leading edge dot — always pinned at the right edge
    ctx.fillStyle = HEAD_COLOR;
    ctx.beginPath();
    ctx.arc(w - 2, scale(norms[n - 1]), 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }, [data, leads_off]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = Math.floor(canvas.offsetWidth * dpr);
      canvas.height = Math.floor(canvas.offsetHeight * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const loop = () => { draw(); animRef.current = requestAnimationFrame(loop); };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}
