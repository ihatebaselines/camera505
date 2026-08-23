"use client";

import { useRef, useEffect } from "react";

interface Props {
  melBands: number[][]; // 2D spectrogram frames (newest frame at end)
}

const MEL_COLOR_MAP: Record<number, string> = {
  0:   "#080A12",  // Silent Noise Floor
  10:  "#0E1A2A",
  25:  "#0C2E42",
  40:  "#005264",
  60:  "#007C8A",
  80:  "#00A896",
  100: "#02C39A",
  120: "#00F2FE",  // Cyan Acoustic Peaks
  140: "#9D4EDD",  // Harmonic Formants
  165: "#F59E0B",  // Snore Resonances (80-500Hz)
  190: "#FF5E7E",  // Cough Spikes
};

function getMelBandColor(db: number): string {
  const thresholds = Object.keys(MEL_COLOR_MAP).map(Number).sort((a, b) => a - b);
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (db >= thresholds[i]) return MEL_COLOR_MAP[thresholds[i]];
  }
  return MEL_COLOR_MAP[0];
}

export default function MelWaterfall({ melBands }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || melBands.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const frames = melBands.length;
    const bands  = melBands[0]?.length || 64;

    ctx.clearRect(0, 0, W, H);

    const colW = W / frames;
    const rowH = H / bands;

    for (let x = 0; x < frames; x++) {
      const frame = melBands[x];
      for (let b = 0; b < bands; b++) {
        const energy = frame?.[b] ?? 0;
        ctx.fillStyle = getMelBandColor(energy);
        ctx.fillRect(
          Math.floor(x * colW),
          Math.floor((bands - 1 - b) * rowH),
          Math.ceil(colW) + 1,
          Math.ceil(rowH) + 1
        );
      }
    }

    // Time-aligned sync line at 50Hz (same timeline as ECG): thin vertical at newest column (right edge)
    // Both ECG (500 samples ~10s at 50Hz) and Mel (80 frames ~1.6s at 50Hz) share 50Hz emission; this line marks "NOW"
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W - 0.5, 0);
    ctx.lineTo(W - 0.5, H);
    ctx.stroke();
    // Subtle glow for visibility on dark spectrogram
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W - 0.5, 0);
    ctx.lineTo(W - 0.5, H);
    ctx.stroke();
  }, [melBands]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: "block", imageRendering: "pixelated" }}
    />
  );
}
