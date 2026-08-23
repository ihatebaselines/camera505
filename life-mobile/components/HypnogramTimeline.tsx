"use client";

import { useState } from "react";

interface SleepEvent {
  time: string;
  duration: string;
  type: "apnea" | "artifact" | "rem_movement";
  title: string;
  posture: string;
  severity: "mild" | "moderate" | "normal";
}

const DEMO_EVENTS: SleepEvent[] = [
  { time: "01:24", duration: "16s", type: "apnea", title: "Obstructive Hypopnea", posture: "Supine (Back)", severity: "mild" },
  { time: "03:12", duration: "22s", type: "apnea", title: "Apnea Pause Event", posture: "Supine (Back)", severity: "moderate" },
  { time: "04:45", duration: "12s", type: "artifact", title: "Position Shift (Turning)", posture: "Back → Side", severity: "normal" },
  { time: "05:38", duration: "14s", type: "rem_movement", title: "Phasic REM Movement", posture: "Lateral (Left)", severity: "normal" },
];

export default function HypnogramTimeline() {
  const [activeEvent, setActiveEvent] = useState<SleepEvent | null>(DEMO_EVENTS[1]);
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Stage Legend & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <div
            onMouseEnter={() => setHoveredStage("Awake")}
            onMouseLeave={() => setHoveredStage(null)}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B6B]" />
            <span className="text-[#CBD5E1]">Awake <strong className="text-white">(7%)</strong></span>
          </div>
          <div
            onMouseEnter={() => setHoveredStage("REM")}
            onMouseLeave={() => setHoveredStage(null)}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#9D4EDD]" />
            <span className="text-[#CBD5E1]">REM <strong className="text-white">(24%)</strong></span>
          </div>
          <div
            onMouseEnter={() => setHoveredStage("Light")}
            onMouseLeave={() => setHoveredStage(null)}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#4CC9F0]" />
            <span className="text-[#CBD5E1]">Light <strong className="text-white">(48%)</strong></span>
          </div>
          <div
            onMouseEnter={() => setHoveredStage("Deep")}
            onMouseLeave={() => setHoveredStage(null)}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#4361EE]" />
            <span className="text-[#CBD5E1]">Deep <strong className="text-white">(21%)</strong></span>
          </div>
        </div>

        <div className="text-[11px] font-mono text-[#7FA8B8]">
          Total: <strong className="text-white">6h 48m</strong> · Efficiency: <strong className="text-[#10B981]">93%</strong>
        </div>
      </div>

      {/* 4-Tier Interactive Stepped Hypnogram SVG */}
      <div className="relative bg-[#080A12] border border-[#262C4E] rounded-2xl p-4 overflow-hidden">
        {/* Stage Labels on Left */}
        <div className="absolute left-3 top-4 bottom-10 flex flex-col justify-between text-[9px] font-mono text-[#4A6175] select-none pointer-events-none">
          <span className="text-[#FF6B6B]">AWAKE</span>
          <span className="text-[#9D4EDD]">REM</span>
          <span className="text-[#4CC9F0]">LIGHT</span>
          <span className="text-[#4361EE]">DEEP</span>
        </div>

        <div className="pl-14">
          <svg viewBox="0 0 600 130" width="100%" height="130" className="overflow-visible">
            <defs>
              <linearGradient id="hypnoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9D4EDD" stopOpacity="0.3" />
                <stop offset="50%" stopColor="#4CC9F0" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#4361EE" stopOpacity="0.4" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Guides */}
            <line x1="0" y1="15" x2="600" y2="15" stroke="#1C203B" strokeWidth="1" strokeDasharray="4,4" />
            <line x1="0" y1="45" x2="600" y2="45" stroke="#1C203B" strokeWidth="1" strokeDasharray="4,4" />
            <line x1="0" y1="75" x2="600" y2="75" stroke="#1C203B" strokeWidth="1" strokeDasharray="4,4" />
            <line x1="0" y1="105" x2="600" y2="105" stroke="#1C203B" strokeWidth="1" strokeDasharray="4,4" />

            {/* Hypnogram Area & Stepped Path */}
            <path
              d="
                M 0 15 
                L 25 15 L 25 75 L 70 75 L 70 105 L 140 105 
                L 140 45 L 190 45 L 190 75 L 250 75 L 250 105 L 310 105 
                L 310 15 L 325 15 L 325 45 L 390 45 L 390 75 L 470 75 
                L 470 45 L 530 45 L 530 75 L 575 75 L 575 15 L 600 15
                L 600 120 L 0 120 Z
              "
              fill="url(#hypnoGrad)"
            />

            <path
              d="
                M 0 15 
                L 25 15 L 25 75 L 70 75 L 70 105 L 140 105 
                L 140 45 L 190 45 L 190 75 L 250 75 L 250 105 L 310 105 
                L 310 15 L 325 15 L 325 45 L 390 45 L 390 75 L 470 75 
                L 470 45 L 530 45 L 530 75 L 575 75 L 575 15 L 600 15
              "
              fill="none"
              stroke="#00F2FE"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Event Pins (Interactive) */}
            {/* Event 1: 01:24 */}
            <g onClick={() => setActiveEvent(DEMO_EVENTS[0])} className="cursor-pointer">
              <rect x="110" y="8" width="22" height="100" fill="#F59E0B" fillOpacity="0.08" rx="4" />
              <circle cx="121" cy="45" r="5" fill="#F59E0B" />
              <circle cx="121" cy="45" r="9" fill="#F59E0B" fillOpacity="0.25" />
            </g>

            {/* Event 2: 03:12 (Selected) */}
            <g onClick={() => setActiveEvent(DEMO_EVENTS[1])} className="cursor-pointer">
              <rect x="298" y="8" width="24" height="100" fill="#FF6B6B" fillOpacity="0.15" rx="4" />
              <circle cx="310" cy="15" r="6" fill="#FF6B6B" />
              <circle cx="310" cy="15" r="11" fill="#FF6B6B" fillOpacity="0.3" />
            </g>

            {/* Event 3: 04:45 */}
            <g onClick={() => setActiveEvent(DEMO_EVENTS[2])} className="cursor-pointer">
              <circle cx="450" cy="75" r="4.5" fill="#4CC9F0" />
            </g>

            {/* Event 4: 05:38 */}
            <g onClick={() => setActiveEvent(DEMO_EVENTS[3])} className="cursor-pointer">
              <circle cx="545" cy="45" r="4.5" fill="#9D4EDD" />
            </g>

            {/* Time Axis Labels */}
            {["23:00", "00:30", "02:00", "03:30", "05:00", "06:30"].map((t, idx) => (
              <text key={t} x={idx * 115} y="128" fontSize="9" fill="#7FA8B8" fontFamily="Inter">
                {t}
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* Active Selected Event Details Card */}
      {activeEvent && (
        <div className="bg-[#121528] border border-[#262C4E] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold ${
                activeEvent.severity === "moderate"
                  ? "bg-[#FF5A79]/15 text-[#FF5A79] border border-[#FF5A79]/30"
                  : "bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30"
              }`}
            >
              ⚠️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">{activeEvent.title}</h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1C203B] text-[#71B4FB]">
                  {activeEvent.time} ({activeEvent.duration})
                </span>
              </div>
              <p className="text-[11px] text-[#7FA8B8]">
                Postural state: <strong className="text-[#CBD5E1]">{activeEvent.posture}</strong> · Severity:{" "}
                <strong className={activeEvent.severity === "moderate" ? "text-[#FF5A79]" : "text-[#F59E0B]"}>
                  {activeEvent.severity.toUpperCase()}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveEvent(null)}
              className="text-xs px-3 py-1.5 rounded-xl bg-[#1C203B] hover:bg-[#242B4D] text-[#CBD5E1] transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
