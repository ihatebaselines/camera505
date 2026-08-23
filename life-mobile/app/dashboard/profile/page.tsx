"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconDna } from "@/components/ui/Icons";
import { Parallax, Reveal } from "@/components/ui/Parallax";
import { getHistory, getProfile, removeNamespacedItem } from "@/lib/userStorage";

interface QuizAnswers {
  age: number;
  gender: string;
  bmi: string;
  sleepPosition: string;
  snore: number;
  fatigue: number;
  choking: boolean;
  hypertension: boolean;
  smartwatch: boolean;
}

interface CohortResult {
  key: string;
  name: string;
  risk: string;
  theta: number;
  tau: number;
  hr: number;
  resp: number;
}

interface StoredProfile {
  answers?: QuizAnswers;
  cohort?: CohortResult;
  cohortName?: string;
}

const RISK_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  HIGH:     { bg: 'rgba(255,51,51,0.10)', color: '#FF3333', border: 'rgba(255,51,51,0.30)' },
  ELEVATED: { bg: 'rgba(255,184,0,0.10)', color: '#FFB800', border: 'rgba(255,184,0,0.30)' },
  LOW:      { bg: 'rgba(14,159,0,0.10)', color: '#0E9F00', border: 'rgba(14,159,0,0.30)' },
};

const BMI_LABEL: Record<string, string> = {
  normal: 'Normal (18.5 – 24.9)',
  overweight: 'Overweight (25.0 – 29.9)',
  obese: 'Obese (≥ 30.0)',
};

const SNORE_LABEL: Record<string, string> = {
  '0': 'Never',
  '1': 'Rarely',
  '2': 'Often (Multiple nights/week)',
  '3': 'Always (Every night)',
};

const FATIGUE_LABEL: Record<string, string> = {
  '0': 'None',
  '1': 'Mild',
  '2': 'Moderate',
  '3': 'Severe',
};

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="flex justify-between items-center px-5 py-4 border-b border-[#222] last:border-b-0 gap-4">
      <span className="font-mono text-[11px] font-bold tracking-[0.06em] uppercase text-[#666] shrink-0">{label}</span>
      <span
        className="font-mono text-xs font-bold text-right max-w-[60%] truncate tracking-[0.04em] uppercase"
        style={{ color: accent || '#FFFFFF' }}
      >
        {value}
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile>({});
  const [userName, setUserName] = useState("Patient");
  const [email, setEmail] = useState("user@camera505.ai");
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    try {
      const u = localStorage.getItem("camera505_user");
      if (u) {
        const parsed = JSON.parse(u);
        setUserName(parsed.name || "Patient");
        setEmail(parsed.email || "user@camera505.ai");
      }
    } catch {}

    try {
      const p = getProfile();
      if (p) setProfile(p);
    } catch {}

    try {
      setHistory(getHistory());
    } catch {}
  }, []);

  const cohort = profile?.cohort;
  const answers = profile?.answers;
  const initials = userName.charAt(0).toUpperCase() || "P";

  const handleLogout = () => {
    // Per-user isolation: remove current user pointer, keep their namespaced data for next login
    localStorage.removeItem("camera505_user");
    // Also clear the per-user first_time flag (namespaced)
    try { removeNamespacedItem("camera505_first_time"); } catch {}
    router.push("/login");
  };

  const avgAhi =
    history.length > 0
      ? (history.reduce((acc, s) => acc + (s.ahi || 0), 0) / history.length).toFixed(1)
      : null;

  const bestScore =
    history.length > 0
      ? Math.max(...history.map((s) => s.stability_score || 0))
      : null;

  return (
    <div className="relative w-full max-w-4xl mx-auto bg-black min-h-screen">
      {/* ── PARALLAX BACKGROUND LAYER ─────────────────────────────── */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <Parallax speed={0.24} className="absolute -top-36 left-[-8rem] w-[24rem] h-[24rem] bg-[#FF3333]/[0.05] blur-3xl" />
        <Parallax speed={0.12} className="absolute top-[36rem] right-[-10rem] w-[24rem] h-[24rem] bg-[#0080FF]/[0.05] blur-3xl" />
        <Parallax speed={0.05} className="absolute top-4 right-2 text-[150px] leading-none font-black tracking-[-0.04em] watermark select-none hidden lg:block">
          DNA
        </Parallax>
      </div>

      <div className="space-y-8 animate-fade-in px-1">

      {/* ── USER HEADER CARD ──────────────────────────────────────── */}
      <Reveal>
        <div className="bg-[#111] border border-[#222] rounded-[2px] p-6 sm:p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-20 h-20 sm:w-20 sm:h-20 rounded-[2px] bg-[#0080FF] border border-[#0080FF] flex items-center justify-center text-2xl sm:text-3xl font-mono font-black text-white shrink-0 tracking-[-0.04em]">
            {initials}
          </div>

          <div className="text-center sm:text-left flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1 justify-center sm:justify-start">
              <h1 className="font-mono text-[24px] sm:text-[28px] font-black tracking-[-0.03em] text-white uppercase truncate">
                {userName}
              </h1>
              <span className="bg-[#0E9F00]/10 text-[#0E9F00] border border-[#0E9F00]/20 font-mono text-[10px] font-bold px-2 py-0.5 rounded-[2px] uppercase tracking-[0.08em] self-center sm:self-auto">
                VERIFIED PROFILE
              </span>
            </div>
            <p className="font-mono text-xs font-bold tracking-[0.04em] text-[#666] truncate">{email.toUpperCase()}</p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-4 pt-3 border-t border-[#222] font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
              <div className="text-[#666]">
                TOTAL NIGHTS: <strong className="text-white font-black tabular-nums ml-1">{history.length}</strong>
              </div>
              {avgAhi !== null && (
                <div className="text-[#666]">
                  AVG AHI: <strong className="text-[#0080FF] font-black tabular-nums ml-1">{avgAhi}</strong> <span className="text-[#555] font-bold">EV/HR</span>
                </div>
              )}
              {bestScore !== null && (
                <div className="text-[#666]">
                  BEST SCORE: <strong className="text-[#FF3333] font-black tabular-nums ml-1">{bestScore}</strong><span className="text-[#555]">/100</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {/* ── AI COHORT CLASSIFICATION CARD ──────────────────────────── */}
      <Reveal delay={80}>
        <div className="space-y-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#666] block px-1">CALIBRATED CLINICAL AI MODEL</span>

          {cohort ? (
            <div className="bg-[#111] border border-[#222] rounded-[2px] overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-[#222] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-[#0A0A0A] border border-[#222] rounded-[2px] flex items-center justify-center text-[#0080FF] shrink-0">
                    <IconDna size={20} />
                  </div>
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] font-bold text-[#666] block mb-0.5">
                      SELECTED ESRS DIAGNOSTIC COHORT
                    </span>
                    <h3 className="font-mono text-[14px] sm:text-[15px] font-black text-white leading-snug uppercase tracking-[-0.01em]">
                      {cohort.name.toUpperCase()}
                    </h3>
                  </div>
                </div>

                <span
                  className="font-mono text-[11px] font-black px-3 py-1.5 rounded-[2px] uppercase self-start sm:self-auto border tracking-[0.08em]"
                  style={{
                    background: RISK_STYLE[cohort.risk]?.bg || 'rgba(14,159,0,0.10)',
                    color: RISK_STYLE[cohort.risk]?.color || '#0E9F00',
                    borderColor: RISK_STYLE[cohort.risk]?.border || 'rgba(14,159,0,0.30)',
                  }}
                >
                  {cohort.risk} APNEA RISK
                </span>
              </div>

              {/* Baseline Hyperparameters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[#222] bg-[#0A0A0A]">
                <div className="p-5">
                  <div className="font-mono text-[10px] text-[#666] font-bold uppercase tracking-[0.12em] mb-2">APNEA PRIOR (θ₀)</div>
                  <div className="font-mono text-[26px] font-black text-[#0E9F00] tabular-nums tracking-[-0.03em] leading-none">
                    {cohort.theta.toFixed(2)}
                  </div>
                  <div className="font-mono text-[10px] text-[#333] mt-2 font-bold uppercase tracking-[0.06em]">ADAPTIVE THRESHOLD</div>
                </div>

                <div className="p-5">
                  <div className="font-mono text-[10px] text-[#666] font-bold uppercase tracking-[0.12em] mb-2">TEMPORAL PRIOR (τ₀)</div>
                  <div className="font-mono text-[26px] font-black text-white tabular-nums tracking-[-0.03em] leading-none">
                    {cohort.tau.toFixed(2)}
                  </div>
                  <div className="font-mono text-[10px] text-[#333] mt-2 font-bold uppercase tracking-[0.06em]">TEMPORAL DECAY</div>
                </div>

                <div className="p-5">
                  <div className="font-mono text-[10px] text-[#666] font-bold uppercase tracking-[0.12em] mb-2">BASELINE HR</div>
                  <div className="font-mono text-[26px] font-black text-[#FF3333] tabular-nums tracking-[-0.03em] leading-none">
                    {cohort.hr} <span className="text-[11px] text-[#555] font-bold tracking-[0.06em]">BPM</span>
                  </div>
                  <div className="font-mono text-[10px] text-[#333] mt-2 font-bold uppercase tracking-[0.06em]">SINUS EXPECTATION</div>
                </div>

                <div className="p-5">
                  <div className="font-mono text-[10px] text-[#666] font-bold uppercase tracking-[0.12em] mb-2">BASELINE RESP</div>
                  <div className="font-mono text-[26px] font-black text-[#0080FF] tabular-nums tracking-[-0.03em] leading-none">
                    {cohort.resp} <span className="text-[11px] text-[#555] font-bold tracking-[0.06em]">RPM</span>
                  </div>
                  <div className="font-mono text-[10px] text-[#333] mt-2 font-bold uppercase tracking-[0.06em]">EDR NORMAL</div>
                </div>
              </div>

              <div className="px-5 py-3 bg-black border-t border-[#222] flex items-center justify-between font-mono text-[11px] tracking-[0.06em] uppercase">
                <span className="text-[#555]">COHORT_KEY: {cohort.key}</span>
                <span className="text-[#0080FF] font-black">CATBOOST ROPE CALIBRATED</span>
              </div>
            </div>
          ) : (
            <div className="bg-[#111] border border-dashed border-[#222] rounded-[2px] p-8 text-center space-y-4">
              <div className="w-12 h-12 bg-[#0A0A0A] border border-[#222] rounded-[2px] flex items-center justify-center text-[#666] mx-auto">
                <IconDna size={22} />
              </div>
              <h3 className="font-mono text-[13px] font-black tracking-[0.08em] uppercase text-white">NO CALIBRATION MODEL ASSIGNED YET</h3>
              <p className="font-mono text-[11px] tracking-[0.04em] uppercase font-bold text-[#666] max-w-sm mx-auto leading-relaxed">
                COMPLETE THE 9-QUESTION ESRS INTAKE QUIZ TO AUTOMATICALLY CLASSIFY YOUR PHYSIOLOGICAL PROFILE INTO ONE OF 12 CLINICAL COHORTS.
              </p>
              <button
                onClick={() => router.push("/quiz")}
                className="btn-go px-5 py-2.5 text-[11px] rounded-[2px] tracking-[0.08em]"
              >
                TAKE INTAKE QUIZ NOW →
              </button>
            </div>
          )}
        </div>
      </Reveal>

      {/* ── HEALTH QUESTIONNAIRE ANSWERS ──────────────────────────── */}
      {answers && (
        <Reveal delay={100}>
          <div className="space-y-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#666] block px-1">INTAKE QUESTIONNAIRE RESPONSES</span>

            <div className="bg-[#111] border border-[#222] rounded-[2px] overflow-hidden">
              <Row
                label="Age Bracket"
                value={
                  answers.age <= 30
                    ? '18–30 years'
                    : answers.age <= 45
                    ? '31–45 years'
                    : answers.age <= 60
                    ? '46–60 years'
                    : '60+ years'
                }
              />
              <Row
                label="Biological Sex"
                value={answers.gender.charAt(0).toUpperCase() + answers.gender.slice(1)}
              />
              <Row
                label="BMI Classification"
                value={BMI_LABEL[answers.bmi] || answers.bmi}
                accent={
                  answers.bmi === 'obese'
                    ? '#FF3333'
                    : answers.bmi === 'overweight'
                    ? '#FFB800'
                    : '#0E9F00'
                }
              />
              <Row
                label="Dominant Sleep Position"
                value={answers.sleepPosition.charAt(0).toUpperCase() + answers.sleepPosition.slice(1)}
              />
              <Row
                label="Snoring Frequency"
                value={SNORE_LABEL[String(answers.snore)] || 'Never'}
                accent={answers.snore >= 2 ? '#FFB800' : undefined}
              />
              <Row
                label="Daytime Fatigue"
                value={FATIGUE_LABEL[String(answers.fatigue)] || 'None'}
                accent={answers.fatigue >= 2 ? '#FFB800' : undefined}
              />
              <Row
                label="Choking / Gasping Arousals"
                value={answers.choking ? 'Yes (Reported)' : 'No'}
                accent={answers.choking ? '#FF3333' : '#0E9F00'}
              />
              <Row
                label="Hypertension / Cardiorespiratory History"
                value={answers.hypertension ? 'Yes' : 'No'}
                accent={answers.hypertension ? '#FF3333' : undefined}
              />
              <Row
                label="Wearable Synchronizer"
                value={answers.smartwatch ? 'Enabled' : 'None'}
              />
            </div>
          </div>
        </Reveal>
      )}

      {/* ── SYSTEM SETTINGS ───────────────────────────────────────── */}
      <Reveal delay={120}>
        <div className="space-y-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#666] block px-1">DEVICE & TELEMETRY CONFIGURATION</span>

          <div className="bg-[#111] border border-[#222] rounded-[2px] overflow-hidden">
            <Row label="Hardware Ingestion Port" value="COM3 (115200 Baud)" />
            <Row label="ECG Sampling Rate" value="50 Hz (AD8232 Continuous)" />
            <Row label="Platform Core Version" value="CAMERA 505 v2.1.0" />
            <Row label="Local Inference Engine" value="Ollama Llama-3.2 (Port 11434)" />
          </div>
        </div>
      </Reveal>

      {/* ── BOTTOM ACTIONS ────────────────────────────────────────── */}
      <Reveal delay={140}>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => router.push("/quiz")}
            className="btn-ghost flex-1 h-14 text-[11px] rounded-[2px] tracking-[0.08em]"
          >
            RETAKE HEALTH QUESTIONNAIRE
          </button>

          <button
            onClick={handleLogout}
            className="flex-1 bg-[#FF3333]/10 hover:bg-[#FF3333] hover:text-white text-[#FF3333] border border-[#FF3333]/30 hover:border-[#FF3333] h-14 rounded-[2px] font-mono font-black text-[11px] tracking-[0.08em] uppercase transition-colors cursor-pointer"
          >
            SIGN OUT OF ACCOUNT
          </button>
        </div>
      </Reveal>

      </div>
    </div>
  );
}
