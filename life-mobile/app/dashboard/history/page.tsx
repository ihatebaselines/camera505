"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { IconArrowRight, IconChart } from "@/components/ui/Icons";
import { Parallax, Reveal } from "@/components/ui/Parallax";
import { getHistory, setHistory as saveHistory } from "@/lib/userStorage";

interface SessionRecord {
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

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [filter, setFilter] = useState("7D");

  const demoData: SessionRecord[] = [
    {
      id: "demo-1",
      date: new Date(Date.now() - 1 * 86400000).toISOString(),
      duration_minutes: 460,
      ahi: 2.1,
      classification: "Normal",
      stability_score: 94,
      sleep_stages: { deep: 25, rem: 20, light: 50, awake: 5 },
    },
    {
      id: "demo-2",
      date: new Date(Date.now() - 2 * 86400000).toISOString(),
      duration_minutes: 420,
      ahi: 3.4,
      classification: "Normal",
      stability_score: 88,
      sleep_stages: { deep: 18, rem: 22, light: 45, awake: 15 },
    },
    {
      id: "demo-3",
      date: new Date(Date.now() - 3 * 86400000).toISOString(),
      duration_minutes: 490,
      ahi: 5.8,
      classification: "Mild",
      stability_score: 78,
      sleep_stages: { deep: 15, rem: 18, light: 55, awake: 12 },
    },
    {
      id: "demo-4",
      date: new Date(Date.now() - 4 * 86400000).toISOString(),
      duration_minutes: 440,
      ahi: 2.8,
      classification: "Normal",
      stability_score: 91,
      sleep_stages: { deep: 22, rem: 24, light: 48, awake: 6 },
    },
    {
      id: "demo-5",
      date: new Date(Date.now() - 5 * 86400000).toISOString(),
      duration_minutes: 510,
      ahi: 1.9,
      classification: "Normal",
      stability_score: 96,
      sleep_stages: { deep: 28, rem: 22, light: 46, awake: 4 },
    },
    {
      id: "demo-6",
      date: new Date(Date.now() - 6 * 86400000).toISOString(),
      duration_minutes: 430,
      ahi: 4.2,
      classification: "Normal",
      stability_score: 85,
      sleep_stages: { deep: 19, rem: 21, light: 50, awake: 10 },
    },
    {
      id: "demo-7",
      date: new Date(Date.now() - 7 * 86400000).toISOString(),
      duration_minutes: 475,
      ahi: 2.5,
      classification: "Normal",
      stability_score: 93,
      sleep_stages: { deep: 24, rem: 23, light: 47, awake: 6 },
    },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    try {
      const parsed = getHistory();
      if (parsed.length > 0) {
        setSessions(parsed);
        return;
      }
      setSessions([]);
    } catch {
      setSessions([]);
    }
  };

  const populateDemoData = () => {
    saveHistory(demoData);
    setSessions(demoData);
  };

  const clearHistory = () => {
    saveHistory([]);
    setSessions([]);
  };

  const displaySessions = sessions.length > 0 ? sessions : [];
  const avgAhi =
    displaySessions.length > 0
      ? (
          displaySessions.reduce((acc, s) => acc + (s.ahi || 0), 0) /
          displaySessions.length
        ).toFixed(1)
      : "—";

  const avgScore =
    displaySessions.length > 0
      ? Math.round(
          displaySessions.reduce((acc, s) => acc + (s.stability_score || 0), 0) /
            displaySessions.length
        )
      : "—";

  const chartData = [...displaySessions].reverse().slice(-7);
  const maxAhi = Math.max(8, ...chartData.map((d) => d.ahi || 0)) + 1.5;

  return (
    <div className="relative w-full max-w-4xl mx-auto bg-black min-h-screen">
      {/* ── PARALLAX BACKGROUND LAYER ─────────────────────────────── */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <Parallax speed={0.24} className="absolute -top-36 right-[-8rem] w-[24rem] h-[24rem] bg-[#0080FF]/[0.05] blur-3xl" />
        <Parallax speed={0.1} className="absolute top-[30rem] left-[-10rem] w-[22rem] h-[22rem] bg-[#222]/[0.5] blur-3xl" />
        <Parallax speed={0.05} className="absolute top-4 right-2 text-[150px] leading-none font-black tracking-[-0.04em] watermark select-none hidden lg:block">
          AHI
        </Parallax>
      </div>

      <div className="space-y-8 animate-fade-in px-1">

      {/* ── HEADER ────────────────────────────────────────────────── */}
      <Reveal>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-[6px] h-[6px] bg-[#0080FF] inline-block" />
              <span className="font-mono text-[10px] font-bold tracking-[0.16em] uppercase text-[#888]">
                LONGITUDINAL ANALYTICS
              </span>
            </div>
            <h1 className="font-mono text-[28px] sm:text-[34px] font-black tracking-[-0.03em] text-white leading-tight uppercase">
              SLEEP SESSION HISTORY
            </h1>
            <p className="font-mono text-[11px] tracking-[0.06em] uppercase font-bold text-[#666] mt-1">
              HISTORICAL TRENDS, AHI VARIANCE, AND OVERNIGHT STABILITY SCORING.
            </p>
          </div>

          {/* Segmented — sharp dark, active white/black inverse */}
          <div className="segmented self-start sm:self-center">
            {["7D", "30D", "All"].map((opt) => (
              <button
                key={opt}
                onClick={() => setFilter(opt)}
                className={`segmented-item ${filter === opt ? "active" : ""}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── STATS CARDS ROW ───────────────────────────────────────── */}
      <Reveal delay={80}>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#111] border border-[#222] rounded-[2px] p-4 sm:p-5 text-center sm:text-left">
            <div className="font-mono text-[10px] text-[#666] font-bold uppercase tracking-[0.12em] mb-2">
              RECORDED NIGHTS
            </div>
            <div className="font-mono text-[28px] sm:text-[36px] font-black text-white tabular-nums tracking-[-0.03em] leading-none">
              {displaySessions.length}
            </div>
            <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#333] mt-2 font-bold">TOTAL SESSIONS</div>
          </div>

          <div className="bg-[#111] border border-[#222] rounded-[2px] p-4 sm:p-5 text-center sm:text-left">
            <div className="font-mono text-[10px] text-[#666] font-bold uppercase tracking-[0.12em] mb-2">
              AVERAGE AHI
            </div>
            <div className="font-mono text-[28px] sm:text-[36px] font-black text-[#0080FF] tabular-nums tracking-[-0.03em] leading-none">
              {avgAhi}
            </div>
            <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#333] mt-2 font-bold">EVENTS/HR</div>
          </div>

          <div className="bg-[#111] border border-[#222] rounded-[2px] p-4 sm:p-5 text-center sm:text-left">
            <div className="font-mono text-[10px] text-[#666] font-bold uppercase tracking-[0.12em] mb-2">
              AVG STABILITY
            </div>
            <div className="font-mono text-[28px] sm:text-[36px] font-black text-[#FF3333] tabular-nums tracking-[-0.03em] leading-none">
              {avgScore}
            </div>
            <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#333] mt-2 font-bold">/100 SCORE</div>
          </div>
        </div>
      </Reveal>

      {/* ── 7-DAY AHI TREND CHART ─────────────────────────────────── */}
      {chartData.length > 0 && (
        <Reveal delay={120}>
          <div className="bg-[#111] border border-[#222] rounded-[2px] p-5 sm:p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] pb-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#888]">7-DAY APNEA SEVERITY TREND</span>
              <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[#666]">
                <span className="flex items-center gap-1.5">
                  <span className="w-[8px] h-[8px] bg-[#0E9F00] inline-block border border-[#0E9F00]" /> &lt;5 NORMAL
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-[8px] h-[8px] bg-[#FFB800] inline-block" /> 5–15 MILD
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-[8px] h-[8px] bg-[#FF3333] inline-block" /> &gt;15 SEVERE
                </span>
              </div>
            </div>

            <div className="h-44 flex items-end justify-between gap-2 sm:gap-3">
              {chartData.map((d, i) => {
                const hPct = Math.max(10, Math.min(100, ((d.ahi || 2) / maxAhi) * 100));
                const color =
                  d.ahi < 5 ? "#0E9F00" : d.ahi < 15 ? "#FFB800" : "#FF3333";
                const dateLabel = new Date(d.date).toLocaleDateString("en-US", {
                  weekday: "short",
                }).toUpperCase();

                return (
                  <div
                    key={i}
                    className="flex flex-col items-center flex-1 h-full justify-end group"
                  >
                    <div className="font-mono text-[11px] font-black text-white mb-2 tabular-nums">
                      {d.ahi}
                    </div>
                    <div
                      className="w-full max-w-[44px] rounded-[2px] transition-all duration-300 group-hover:opacity-80 border border-white/10"
                      style={{ height: `${hPct}%`, backgroundColor: color }}
                    />
                    <div className="font-mono text-[10px] text-[#666] font-bold tracking-[0.06em] uppercase mt-2">
                      {dateLabel}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.06em] uppercase text-[#333] border-t border-[#222] pt-3">
              <span>AHI EVENTS/HR · LAST 7 SESSIONS</span>
              <span>50HZ DSP</span>
            </div>
          </div>
        </Reveal>
      )}

      {/* ── SESSION LOG CARDS LIST ────────────────────────────────── */}
      <Reveal delay={100}>
        <div className="space-y-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#666] block px-1">DETAILED NIGHT LOGS</span>

          {displaySessions.length > 0 ? (
            <div className="bg-[#111] border border-[#222] rounded-[2px] overflow-hidden divide-y divide-[#222]">
              {displaySessions.map((s, i) => (
                <div
                  key={s.id || i}
                  className="px-5 sm:px-5 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#0A0A0A] transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-white text-[13px] tracking-[-0.01em] uppercase">
                        {new Date(s.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        }).toUpperCase()}
                      </span>
                      <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-[2px] uppercase border tracking-[0.06em] ${
                        (s.classification || "Normal").toUpperCase() === "NORMAL"
                          ? "bg-[#0E9F00]/10 text-[#0E9F00] border-[#0E9F00]/20"
                          : (s.classification || "").toUpperCase() === "MILD"
                          ? "bg-[#FFB800]/10 text-[#FFB800] border-[#FFB800]/20"
                          : "bg-[#FF3333]/10 text-[#FF3333] border-[#FF3333]/20"
                      }`}>
                        {(s.classification || "Normal").toUpperCase()}
                      </span>
                    </div>

                    <div className="font-mono text-[11px] tracking-[0.04em] uppercase font-bold text-[#555]">
                      DURATION: {Math.floor(s.duration_minutes / 60)}H{" "}
                      {s.duration_minutes % 60}M · RECORDED WITH COM3 50HZ INGESTION
                    </div>

                    {s.sleep_stages && (
                      <div className="h-[6px] w-48 sm:w-64 flex overflow-hidden gap-[1px] bg-[#222] rounded-[2px] p-[1px] mt-2">
                        <div
                          className="bg-white rounded-[1px] h-full"
                          style={{ width: `${s.sleep_stages.deep}%` }}
                        />
                        <div
                          className="bg-[#0080FF] rounded-[1px] h-full"
                          style={{ width: `${s.sleep_stages.rem}%` }}
                        />
                        <div
                          className="bg-[#555] rounded-[1px] h-full"
                          style={{ width: `${s.sleep_stages.light}%` }}
                        />
                        <div
                          className="bg-[#FF3333] rounded-[1px] h-full"
                          style={{ width: `${s.sleep_stages.awake}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 border-t sm:border-t-0 border-[#222] pt-3 sm:pt-0 font-mono">
                    <div className="text-[11px] tracking-[0.06em] uppercase font-bold text-[#666]">
                      AHI: <strong className="text-white font-black text-sm tabular-nums ml-1">{s.ahi}</strong> <span className="text-[#555] font-bold">EVENTS/HR</span>
                    </div>
                    <div className="text-[13px] font-black text-[#FF3333] tabular-nums tracking-[-0.02em]">
                      {s.stability_score} <span className="text-[#666] text-[11px]">/100</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#111] border border-dashed border-[#222] rounded-[2px] p-10 text-center space-y-4">
              <div className="w-12 h-12 bg-[#0A0A0A] border border-[#222] rounded-[2px] flex items-center justify-center text-[#666] mx-auto">
                <IconChart size={22} />
              </div>
              <h3 className="font-mono text-[13px] font-black tracking-[0.08em] uppercase text-white">NO SLEEP HISTORY RECORDED YET</h3>
              <p className="font-mono text-[11px] tracking-[0.04em] uppercase font-bold text-[#666] max-w-sm mx-auto leading-relaxed">
                YOUR NIGHTLY CARDIORESPIRATORY MONITORING SESSIONS WILL AUTOMATICALLY BE STORED HERE WITH AHI, STABILITY, AND SLEEP STAGE ARCHITECTURE.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <Link href="/dashboard/night">
                  <button className="btn-go px-5 py-2.5 text-[11px] rounded-[2px] tracking-[0.08em]">
                    START FIRST NIGHT SESSION
                    <IconArrowRight size={13} />
                  </button>
                </Link>
                <button
                  onClick={populateDemoData}
                  className="btn-ghost px-4 py-2.5 text-[11px] rounded-[2px] tracking-[0.08em]"
                >
                  POPULATE 7-DAY DEMO RECORDS
                </button>
              </div>
            </div>
          )}
        </div>
      </Reveal>

      {/* ── FOOTER HELPER ─────────────────────────────────────────── */}
      {displaySessions.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-1 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
          <button
            onClick={populateDemoData}
            className="text-[#666] hover:text-white transition-colors cursor-pointer border border-transparent hover:border-[#222] bg-transparent hover:bg-[#111] px-2 py-1 rounded-[2px]"
          >
            RESET TO 7-DAY CLINICAL DEMO DATASET
          </button>
          <button
            onClick={clearHistory}
            className="text-[#FF3333] hover:text-white hover:bg-[#FF3333] border border-[#FF3333]/30 hover:border-[#FF3333] px-2 py-1 rounded-[2px] transition-colors cursor-pointer"
          >
            CLEAR SESSION HISTORY
          </button>
        </div>
      )}

      </div>
    </div>
  );
}
