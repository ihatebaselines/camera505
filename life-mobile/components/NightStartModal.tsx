"use client";

import React, { useState } from "react";
import { UserHealthProfile } from "./OnboardingQuizModal";

interface NightStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: UserHealthProfile;
  onStartNight: (config: {
    useMicrophone: boolean;
    sourceType: "synthetic" | "serial";
    comPort: string;
    baudRate: number;
    scenario: string;
  }) => void;
  onOpenQuiz: () => void;
}

export default function NightStartModal({
  isOpen,
  onClose,
  currentProfile,
  onStartNight,
  onOpenQuiz
}: NightStartModalProps) {
  const [useMic, setUseMic] = useState<boolean>(true);
  const [sourceType, setSourceType] = useState<"synthetic" | "serial">("serial");
  const [comPort, setComPort] = useState<string>("COM3");
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [scenario, setScenario] = useState<string>("HEALTHY_REST");

  if (!isOpen) return null;

  const handleLaunch = () => {
    onStartNight({
      useMicrophone: useMic,
      sourceType,
      comPort,
      baudRate,
      scenario
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-xl glass-card border border-[#71B4FB]/40 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#262C4E] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#71B4FB] to-[#9D4EDD] flex items-center justify-center text-xl shadow-lg shadow-[#71B4FB]/25">
              🌙
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white tracking-wide">
                Start New Night Sleep Session
              </h3>
              <p className="text-xs text-[#7FA8B8]">
                Configure patient prior, audio acoustics, and sensor telemetry.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#7FA8B8] hover:text-white transition text-lg"
          >
            ✕
          </button>
        </div>

        {/* Patient Profile Card */}
        <div className="p-4 rounded-2xl bg-[#0F1326] border border-[#262C4E] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#71B4FB]/20 text-[#71B4FB] font-bold text-sm flex items-center justify-center">
              {currentProfile.userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>{currentProfile.userName} ({currentProfile.age}y, {currentProfile.gender})</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 font-mono">
                  {currentProfile.matchedCohort?.cohortName || "Healthy Adult"}
                </span>
              </div>
              <p className="text-[11px] text-[#7FA8B8] font-mono mt-0.5">
                Baseline Prior: θ₀={currentProfile.matchedCohort?.thresholdOffsetTheta.toFixed(3) ?? "0.050"} · τ₀={currentProfile.matchedCohort?.temperatureTau.toFixed(3) ?? "0.050"}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onClose();
              onOpenQuiz();
            }}
            className="text-xs text-[#71B4FB] hover:text-white border border-[#71B4FB]/30 px-2.5 py-1 rounded-xl hover:bg-[#71B4FB]/20 transition"
          >
            📋 Retake Quiz
          </button>
        </div>

        {/* Microphone Audio Ingestion Choice */}
        <div className="p-4 rounded-2xl bg-[#0F1326] border border-[#262C4E] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🎙️</span>
              <div>
                <span className="text-xs font-bold text-white block">
                  Enable Microphone Audio Ingestion
                </span>
                <span className="text-[11px] text-[#7FA8B8]">
                  Streams 16kHz audio for acoustic snore, breathing sound, and cough classification.
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useMic}
                onChange={(e) => setUseMic(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10B981]"></div>
            </label>
          </div>
          {useMic && (
            <div className="p-2.5 rounded-xl bg-[#10B981]/10 border border-[#10B981]/25 text-[11px] text-[#10B981] flex items-center gap-2 font-mono">
              <span>✓</span>
              <span>Browser WebAudio API will capture acoustic snore spectrograms automatically.</span>
            </div>
          )}
        </div>

        {/* Hardware Sensor Source Selection */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-[#CBD5E1] uppercase tracking-wider">
            Cardiorespiratory Sensor Modality
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSourceType("serial")}
              className={`p-3 rounded-2xl text-left border transition-all ${
                sourceType === "serial"
                  ? "bg-[#10B981]/15 border-[#10B981] text-white shadow-lg shadow-[#10B981]/20"
                  : "bg-[#0F1326] border-[#262C4E] text-[#7FA8B8] hover:border-slate-600"
              }`}
            >
              <div className="text-xs font-bold flex items-center gap-1.5">
                <span>⚡</span>
                <span>Physical USB Hardware</span>
              </div>
              <div className="text-[10px] mt-1 font-mono text-[#CBD5E1]">
                ESP32 / AD8232 ECG (COM3 @ 115200)
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSourceType("synthetic")}
              className={`p-3 rounded-2xl text-left border transition-all ${
                sourceType === "synthetic"
                  ? "bg-[#71B4FB]/15 border-[#71B4FB] text-white shadow-lg shadow-[#71B4FB]/20"
                  : "bg-[#0F1326] border-[#262C4E] text-[#7FA8B8] hover:border-slate-600"
              }`}
            >
              <div className="text-xs font-bold flex items-center gap-1.5">
                <span>🧪</span>
                <span>Medical 50Hz Simulator</span>
              </div>
              <div className="text-[10px] mt-1 font-mono text-[#CBD5E1]">
                Physiological Synthesizer + RSA
              </div>
            </button>
          </div>

          {sourceType === "serial" ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-[#7FA8B8] mb-1 font-medium">
                  Serial COM Port
                </label>
                <select
                  value={comPort}
                  onChange={(e) => setComPort(e.target.value)}
                  className="w-full bg-[#0F1326] border border-[#262C4E] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#71B4FB]"
                >
                  <option value="COM3">COM3 (Silicon Labs CP2102)</option>
                  <option value="COM5">COM5</option>
                  <option value="COM4">COM4</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#7FA8B8] mb-1 font-medium">
                  Baud Rate
                </label>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  className="w-full bg-[#0F1326] border border-[#262C4E] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#71B4FB]"
                >
                  <option value={115200}>115200 (ESP32 ECG)</option>
                  <option value={921600}>921600 (Wi-Fi CSI Radar)</option>
                  <option value={9600}>9600 (Arduino UNO)</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="pt-1">
              <label className="block text-[11px] text-[#7FA8B8] mb-1 font-medium">
                Simulation Scenario
              </label>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                className="w-full bg-[#0F1326] border border-[#262C4E] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#71B4FB]"
              >
                <option value="HEALTHY_REST">Healthy Rest (Normal Sinus Rhythm)</option>
                <option value="SLEEP_APNEA">Sleep Apnea (Repetitive 30s Airway Obstruction)</option>
                <option value="SNORING_EPISODE">Snoring Episode (Vibrational Turbulence)</option>
                <option value="ARRHYTHMIA">Cardiac Arrhythmia (PVCs + Irregular RR)</option>
                <option value="COUGH_ATTACK">Cough Attack (Diaphragmatic Transients)</option>
              </select>
            </div>
          )}
        </div>

        {/* Launch Button */}
        <div className="pt-3 border-t border-[#262C4E] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl bg-[#1C203B] hover:bg-[#262C4E] text-[#CBD5E1] font-semibold text-xs transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLaunch}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#71B4FB] via-[#10B981] to-[#9D4EDD] hover:opacity-90 text-white font-extrabold text-xs shadow-xl shadow-[#71B4FB]/25 transition flex items-center gap-2"
          >
            <span>🚀</span>
            <span>Launch Night Monitoring Station</span>
          </button>
        </div>

      </div>
    </div>
  );
}
