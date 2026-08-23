"use client";

import { useRef, useEffect } from "react";

interface RadarProps {
  stability: number;       // 0..1
  reconstruction: number;  // 0..1
  prediction: number;      // 0..1
  drift: number;           // 0..1
  anomaly: number;         // 0..1 composite
}

const LABELS = ["Stability", "Reconstruction", "Prediction", "Drift"];
const ANGLES = LABELS.map((_, i) => (Math.PI * 2 * i) / LABELS.length - Math.PI / 2);

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export default function AnomalyRadar({ stability, reconstruction, prediction, drift, anomaly }: RadarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const values = [stability, reconstruction, prediction, drift];
  const riskColor = anomaly > 0.6 ? "#FF5E7E" : anomaly > 0.35 ? "#F59E0B" : "#10B981";
  const riskLabel = anomaly > 0.6 ? "HIGH RISK" : anomaly > 0.35 ? "ELEVATED" : "NOMINAL";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R  = Math.min(W, H) / 2 - 24;

    ctx.clearRect(0, 0, W, H);

    // Draw Grid Concentric Web Rings
    for (let ring = 1; ring <= 4; ring++) {
      const r = (ring / 4) * R;
      ctx.beginPath();
      ANGLES.forEach((angle, i) => {
        const { x, y } = polarToXY(cx, cy, r, angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw Radial Axis Lines
    ANGLES.forEach((angle) => {
      const { x, y } = polarToXY(cx, cy, R, angle);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)"; ctx.lineWidth = 1; ctx.stroke();
    });

    // Draw Filled Data Polygon
    ctx.beginPath();
    values.forEach((v, i) => {
      const { x, y } = polarToXY(cx, cy, Math.min(v, 1) * R, ANGLES[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = `${riskColor}28`;
    ctx.fill();
    ctx.strokeStyle = riskColor;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = riskColor;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dot at each vertex
    values.forEach((v, i) => {
      const { x, y } = polarToXY(cx, cy, Math.min(v, 1) * R, ANGLES[i]);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = riskColor; ctx.fill();
    });

    // Axis Labels
    ctx.fillStyle = "rgba(203, 213, 225, 0.7)";
    ctx.font = `10px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ANGLES.forEach((angle, i) => {
      const { x, y } = polarToXY(cx, cy, R + 16, angle);
      ctx.fillText(LABELS[i], x, y);
    });

    // Center Anomaly Score
    ctx.font = `bold 16px Inter, sans-serif`;
    ctx.fillStyle = riskColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${(anomaly * 100).toFixed(0)}%`, cx, cy - 7);
    ctx.font = `8.5px Inter, sans-serif`;
    ctx.fillText(riskLabel, cx, cy + 9);
  }, [stability, reconstruction, prediction, drift, anomaly, riskColor, riskLabel]);

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

  return <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />;
}
