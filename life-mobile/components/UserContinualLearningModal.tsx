"use client";

import { useState, useEffect } from "react";

interface TrajectoryPoint {
  session_idx: number;
  date: string;
  duration_mins?: number;
  theta: number;
  temperature: number;
  hr_mean: number;
  resp_mean: number;
  rmssd?: number;
  stability_score: number;
  ahi_screening: number;
  events_count?: number;
  note: string;
}

interface UserTrajectoryData {
  user_id: string;
  user_name: string;
  initial_cohort: string;
  total_sessions: number;
  cumulative_hours: number;
  current_parameters: {
    theta_offset: number;
    temperature_tau: number;
    weights_W: number[];
    hr_mean: number;
    resp_mean: number;
    typical_rmssd: number;
  };
  trajectory: TrajectoryPoint[];
}

interface Props {
  userId: string;
  onClose: () => void;
}

export default function UserContinualLearningModal({ userId, onClose }: Props) {
  const [data, setData] = useState<UserTrajectoryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch(`/api/user/trajectory/${userId || "demo_user"}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const traj = data?.trajectory || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg overflow-y-auto">
      <div className="glass-card max-w-4xl w-full p-6 sm:p-8 space-y-6 text-[#F8FAFC] my-8 border border-[#10B981]/30 shadow-2xl">
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#262C4E] gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10B981] to-[#71B4FB] flex items-center justify-center text-xl font-bold text-[#080A12] shadow-lg shadow-[#10B981]/25">
              📈
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold text-[#10B981] uppercase tracking-wider">
                CAMERA 505 Continual Lifelong Learning Engine (No Catastrophic Forgetting)
              </span>
              <h2 className="text-lg font-bold text-white">
                CAMERA 505 Personal Adaptive Trajectory ({data?.user_name || userId})
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

        {/* Current Adapted Parameters Ribbon */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-[#080A12] p-3.5 rounded-2xl border border-[#262C4E]">
              <p className="text-[10px] text-[#7FA8B8]">Personalized Threshold (θ)</p>
              <p className="text-xl font-bold font-mono text-[#9D4EDD]">
                {data.current_parameters?.theta_offset?.toFixed(4) || "0.0500"}
              </p>
              <p className="text-[9px] text-[#10B981]">Adapted over {data.total_sessions} sessions</p>
            </div>

            <div className="bg-[#080A12] p-3.5 rounded-2xl border border-[#262C4E]">
              <p className="text-[10px] text-[#7FA8B8]">Adapted Resting HR Baseline</p>
              <p className="text-xl font-bold font-mono text-[#FF5E7E]">
                {data.current_parameters?.hr_mean?.toFixed(1) || "72.0"} <span className="text-xs font-normal">BPM</span>
              </p>
              <p className="text-[9px] text-[#CBD5E1]">Gaussian Bayesian Prior</p>
            </div>

            <div className="bg-[#080A12] p-3.5 rounded-2xl border border-[#262C4E]">
              <p className="text-[10px] text-[#7FA8B8]">Adapted Respiration Baseline</p>
              <p className="text-xl font-bold font-mono text-[#00F2FE]">
                {data.current_parameters?.resp_mean?.toFixed(1) || "15.0"} <span className="text-xs font-normal">RPM</span>
              </p>
              <p className="text-[9px] text-[#CBD5E1]">Thoracic Modulation</p>
            </div>

            <div className="bg-[#080A12] p-3.5 rounded-2xl border border-[#262C4E]">
              <p className="text-[10px] text-[#7FA8B8]">Cumulative Hours</p>
              <p className="text-xl font-bold font-mono text-white">
                {data.cumulative_hours?.toFixed(1) || "0.0"} <span className="text-xs font-normal">hrs</span>
              </p>
              <p className="text-[9px] text-[#7FA8B8]">Lifelong Memory</p>
            </div>
          </div>
        )}

        {/* Multi-Session Learning History Table */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-white">Session-by-Session Adaptation History</span>
            <span className="text-[10px] text-[#7FA8B8]">Online EMA rate: α=0.25 (Threshold), β=0.20 (Vitals)</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#262C4E] bg-[#080A12]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#121528] text-[10px] uppercase text-[#7FA8B8] font-mono border-b border-[#262C4E]">
                <tr>
                  <th className="p-3">Session</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Stability Score</th>
                  <th className="p-3">Mean HR</th>
                  <th className="p-3">Mean Resp</th>
                  <th className="p-3">Learned θ</th>
                  <th className="p-3">Estimated AHI</th>
                  <th className="p-3">Adaptation Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262C4E]/60">
                {traj.map((t, idx) => (
                  <tr key={idx} className="hover:bg-[#121528]/50 transition">
                    <td className="p-3 font-mono font-bold text-[#71B4FB]">
                      #{t.session_idx}
                    </td>
                    <td className="p-3 text-[11px] text-[#CBD5E1]">{t.date}</td>
                    <td className="p-3 font-mono font-bold text-[#10B981]">{t.stability_score}/100</td>
                    <td className="p-3 font-mono text-[#FF5E7E]">{t.hr_mean} BPM</td>
                    <td className="p-3 font-mono text-[#00F2FE]">{t.resp_mean} RPM</td>
                    <td className="p-3 font-mono font-bold text-[#9D4EDD]">{t.theta?.toFixed(4)}</td>
                    <td className="p-3 font-mono text-[#FA8C73]">{t.ahi_screening}</td>
                    <td className="p-3 text-[11px] text-[#CBD5E1]">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[#1C203B] hover:bg-[#242B4D] text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Close Trajectory
          </button>
        </div>
      </div>
    </div>
  );
}
