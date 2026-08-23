"use client";

import { useState, useEffect } from "react";

export interface CohortItem {
  id: string;
  name: string;
  category: string;
  age_range: string;
  description: string;
  threshold_offset: number;
  temperature: number;
  weights: number[];
  typical_hr: number;
  typical_resp: number;
  apnea_risk_prior: string;
  reference_datasets: string[];
}

interface Props {
  activeCohortId: string;
  onSelectCohort: (cohort: CohortItem) => void;
  onClose: () => void;
}

export default function AdaptiveBaselineStudioModal({
  activeCohortId,
  onSelectCohort,
  onClose,
}: Props) {
  const [cohorts, setCohorts] = useState<CohortItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>(activeCohortId || "healthy_adult");
  const [theta, setTheta] = useState<number>(0.05);
  const [tau, setTau] = useState<number>(0.50);
  const [posture, setPosture] = useState<"back" | "side" | "stomach">("side");
  const [filterCategory, setFilterCategory] = useState<string>("All");

  useEffect(() => {
    fetch("/api/adaptive/cohorts")
      .then((res) => res.json())
      .then((data) => {
        if (data.cohorts && data.cohorts.length > 0) {
          setCohorts(data.cohorts);
          const current = data.cohorts.find((c: CohortItem) => c.id === selectedId) || data.cohorts[0];
          if (current) {
            setTheta(current.threshold_offset);
            setTau(current.temperature);
          }
        }
      })
      .catch(() => {});
  }, [selectedId]);

  const handleSelect = (c: CohortItem) => {
    setSelectedId(c.id);
    setTheta(c.threshold_offset);
    setTau(c.temperature);
  };

  const activeCohort = cohorts.find((c) => c.id === selectedId) || cohorts[0];

  // Compute 40 points for the Soft-Sigmoid response curve: P = 1 / (1 + exp(-(s - (theta + posture_bias)) / tau))
  const postureBias = posture === "back" ? 0.15 : posture === "side" ? -0.05 : 0.0;
  const effectiveTheta = theta + postureBias;
  const curvePoints = Array.from({ length: 41 }, (_, i) => {
    const s = -1.5 + (i / 40) * 3.0; // from -1.5 to +1.5
    const prob = 1.0 / (1.0 + Math.exp(-(s - effectiveTheta) / Math.max(0.01, tau)));
    return { s, prob };
  });

  const categories = ["All", ...Array.from(new Set(cohorts.map((c) => c.category)))];
  const filteredCohorts = filterCategory === "All" ? cohorts : cohorts.filter((c) => c.category === filterCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg overflow-y-auto">
      <div className="glass-card max-w-4xl w-full p-6 sm:p-8 space-y-6 text-[#F8FAFC] my-8 border border-[#9D4EDD]/30 shadow-2xl">
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#262C4E] gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#9D4EDD] to-[#71B4FB] flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-[#9D4EDD]/25">
              🧠
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold text-[#9D4EDD] uppercase tracking-wider">
                CAMERA 505 Differentiable Adaptive Threshold Engine (206,318 Hours ESRS Registry)
              </span>
              <h2 className="text-lg font-bold text-white">
                CAMERA 505 Clinical Baseline &amp; Soft-Sigmoid Calibrator
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1C203B] hover:bg-[#242B4D] flex items-center justify-center text-xs text-[#CBD5E1] cursor-pointer transition"
          >
            ✕
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer flex-shrink-0 ${
                filterCategory === cat
                  ? "bg-[#9D4EDD] text-white font-bold"
                  : "bg-[#080A12] border border-[#262C4E] text-[#7FA8B8] hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 2-Column Layout: Left Cohort List / Right Math Model & Tuning */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left 6 Cols: Cohort Cards List */}
          <div className="lg:col-span-6 space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
            {filteredCohorts.map((c) => {
              const isSelected = c.id === selectedId;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer space-y-1.5 ${
                    isSelected
                      ? "bg-[#9D4EDD]/20 border-[#9D4EDD] shadow-lg shadow-[#9D4EDD]/15"
                      : "bg-[#080A12] border-[#262C4E] hover:border-[#9D4EDD]/50 hover:bg-[#121528]"
                  }`}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">{c.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1C203B] text-[#71B4FB]">
                      {c.age_range}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#CBD5E1] line-clamp-2">{c.description}</p>
                  <div className="flex gap-3 text-[10px] font-mono text-[#7FA8B8] pt-0.5">
                    <span>θ: <strong className="text-[#9D4EDD]">{c.threshold_offset.toFixed(2)}</strong></span>
                    <span>τ: <strong className="text-[#FA8C73]">{c.temperature.toFixed(2)}</strong></span>
                    <span>Typ. HR: <strong className="text-[#FF5E7E]">{c.typical_hr}</strong> BPM</span>
                    <span>Resp: <strong className="text-[#00F2FE]">{c.typical_resp}</strong> RPM</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 6 Cols: Mathematical Soft-Sigmoid Response Curve & Live Sliders */}
          <div className="lg:col-span-6 space-y-4 bg-[#080A12] p-5 rounded-3xl border border-[#262C4E]">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-white">Soft-Sigmoid Activation Curve</span>
              <span className="font-mono text-[10px] text-[#9D4EDD]">
                P(anomaly) = σ((s − θ) / τ)
              </span>
            </div>

            {/* SVG Interactive Response Curve */}
            <div className="h-44 bg-[#121528] rounded-2xl p-2 border border-[#262C4E] relative overflow-hidden">
              <svg viewBox="0 0 300 130" width="100%" height="100%" className="overflow-visible">
                {/* Decision boundary line (P = 0.5) */}
                <line x1="0" y1="65" x2="300" y2="65" stroke="#262C4E" strokeWidth="1" strokeDasharray="4,4" />
                <text x="5" y="62" fontSize="8" fill="#7FA8B8" fontFamily="Inter">
                  P = 0.50 Decision Line
                </text>

                {/* Soft-Sigmoid Curve Path */}
                <path
                  d={curvePoints
                    .map((pt, idx) => {
                      const x = (idx / 40) * 300;
                      const y = 120 - pt.prob * 110;
                      return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke="#9D4EDD"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Effective Theta Threshold Marker */}
                {(() => {
                  const markerX = ((effectiveTheta + 1.5) / 3.0) * 300;
                  return (
                    <g>
                      <line x1={markerX} y1="0" x2={markerX} y2="130" stroke="#FF5E7E" strokeWidth="1.5" strokeDasharray="3,3" />
                      <circle cx={markerX} cy="65" r="5" fill="#FF5E7E" />
                      <text x={Math.min(240, Math.max(10, markerX - 25))} y="20" fontSize="8" fontWeight="bold" fill="#FF5E7E" fontFamily="Inter">
                        θ_eff = {effectiveTheta.toFixed(2)}
                      </text>
                    </g>
                  );
                })()}
              </svg>
            </div>

            {/* Live Sliders for Theta and Tau */}
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#CBD5E1]">Learned Threshold Offset (θ):</span>
                  <span className="font-mono font-bold text-[#9D4EDD]">{theta.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="-0.50"
                  max="1.00"
                  step="0.01"
                  value={theta}
                  onChange={(e) => setTheta(parseFloat(e.target.value))}
                  className="w-full accent-[#9D4EDD] cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#CBD5E1]">Decision Temperature (τ / Sharpness):</span>
                  <span className="font-mono font-bold text-[#FA8C73]">{tau.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="1.00"
                  step="0.01"
                  value={tau}
                  onChange={(e) => setTau(parseFloat(e.target.value))}
                  className="w-full accent-[#FA8C73] cursor-pointer"
                />
              </div>

              {/* Posture Bias Selector */}
              <div className="space-y-1 pt-1">
                <span className="text-[#CBD5E1] block">Active Sleeping Posture Bias:</span>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  {[
                    { id: "back", label: "Supine (+0.15 θ)", icon: "🛌" },
                    { id: "side", label: "Lateral (-0.05 θ)", icon: "🌙" },
                    { id: "stomach", label: "Prone (0.00 θ)", icon: "🛏️" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPosture(p.id as any)}
                      className={`p-2 rounded-xl border text-center font-semibold transition cursor-pointer ${
                        posture === p.id
                          ? "bg-[#71B4FB]/20 border-[#71B4FB] text-[#71B4FB]"
                          : "bg-[#121528] border-[#262C4E] text-[#7FA8B8]"
                      }`}
                    >
                      <span>{p.icon} {p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Apply Button */}
            <button
              onClick={() => {
                if (activeCohort) {
                  onSelectCohort({
                    ...activeCohort,
                    threshold_offset: theta,
                    temperature: tau,
                  });
                }
                onClose();
              }}
              className="w-full py-3.5 bg-gradient-to-r from-[#9D4EDD] to-[#71B4FB] text-white rounded-2xl text-xs font-bold hover:brightness-110 active:scale-95 transition cursor-pointer shadow-lg shadow-[#9D4EDD]/20 flex items-center justify-center gap-2"
            >
              <span>⚡</span> Apply Calibrated Baseline ({activeCohort?.name || "Cohort"})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
