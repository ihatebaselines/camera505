"use client";

import { useState } from "react";

export interface CohortProfile {
  cohortKey: string;
  cohortName: string;
  cohortDescription: string;
  apneaRiskPrior: "LOW" | "ELEVATED" | "HIGH";
  thresholdOffsetTheta: number;
  temperatureTau: number;
  expectedHr: number;
  expectedResp: number;
  referenceDatasets: string[];
}

export interface UserHealthProfile {
  userName: string;
  age: number;
  gender: "male" | "female" | "other";
  sleepPosition: "back" | "side" | "stomach" | "variable";
  snoreFrequency: number;     // 0=Never, 1=Rarely, 2=Often, 3=Always
  daytimeFatigue: number;     // 0=None, 1=Mild, 2=Moderate, 3=Severe
  chokingAwakenings: boolean; // Gasps or choking during night
  bmiCategory: "normal" | "overweight" | "obese";
  hasSmartwatch: boolean;
  matchedCohort?: CohortProfile;
}

interface Props {
  initialProfile: UserHealthProfile;
  onComplete: (profile: UserHealthProfile) => void;
  onClose: () => void;
}

const PRESET_PERSONAS: Record<string, UserHealthProfile> = {
  natasha: {
    userName: "Natasha",
    age: 58,
    gender: "female",
    sleepPosition: "back",
    snoreFrequency: 2,
    daytimeFatigue: 3,
    chokingAwakenings: false,
    bmiCategory: "normal",
    hasSmartwatch: false,
    matchedCohort: {
      cohortKey: "snoring_mild",
      cohortName: "Snoring & Mild Apnea (SHHS / MESA)",
      cohortDescription: "Calibrated from 206,318 hours of clinical sleep recordings.",
      apneaRiskPrior: "ELEVATED",
      thresholdOffsetTheta: 0.38,
      temperatureTau: 0.55,
      expectedHr: 74.0,
      expectedResp: 15.2,
      referenceDatasets: ["shhs", "ucddb", "apnea_ecg", "dreamt_2026"],
    },
  },
  alex: {
    userName: "Alex",
    age: 26,
    gender: "male",
    sleepPosition: "side",
    snoreFrequency: 0,
    daytimeFatigue: 0,
    chokingAwakenings: false,
    bmiCategory: "normal",
    hasSmartwatch: true,
    matchedCohort: {
      cohortKey: "athlete_bradycardia",
      cohortName: "Athletic & High HRV (Fantasia / BIDMC)",
      cohortDescription: "Trained on elite endurance athletes with low resting heart rate.",
      apneaRiskPrior: "LOW",
      thresholdOffsetTheta: 0.22,
      temperatureTau: 0.40,
      expectedHr: 54.0,
      expectedResp: 12.0,
      referenceDatasets: ["fantasia", "bidmc", "icentia11k"],
    },
  },
  mihai: {
    userName: "Mihai",
    age: 49,
    gender: "male",
    sleepPosition: "back",
    snoreFrequency: 3,
    daytimeFatigue: 3,
    chokingAwakenings: true,
    bmiCategory: "obese",
    hasSmartwatch: false,
    matchedCohort: {
      cohortKey: "obese_severe_apnea",
      cohortName: "High Apnea Index & Postural Risk (CAP Sleep)",
      cohortDescription: "Optimized for high-frequency desaturation and airway collapse events.",
      apneaRiskPrior: "HIGH",
      thresholdOffsetTheta: 0.65,
      temperatureTau: 0.72,
      expectedHr: 82.0,
      expectedResp: 18.5,
      referenceDatasets: ["cap_sleep", "shhs", "apnea_ecg"],
    },
  },
};

export default function OnboardingQuizModal({ initialProfile, onComplete, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<UserHealthProfile>(initialProfile);
  const [loading, setLoading] = useState(false);

  const selectPersona = (key: string) => {
    const p = PRESET_PERSONAS[key];
    if (p) {
      setProfile(p);
    }
  };

  const handleEvaluate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quiz/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: profile.age,
          gender: profile.gender,
          bmi_category: profile.bmiCategory,
          sleep_position: profile.sleepPosition,
          snore_frequency: profile.snoreFrequency,
          daytime_fatigue: profile.daytimeFatigue,
          choking_awakenings: profile.chokingAwakenings,
        }),
      });
      const data = await res.json();
      const updated: UserHealthProfile = {
        ...profile,
        matchedCohort: {
          cohortKey: data.cohort_key || "snoring_mild",
          cohortName: data.cohort_name || "Personalized Foundation Baseline",
          cohortDescription: data.description || "Calibrated on 206,318 hours registry.",
          apneaRiskPrior: data.risk_level || "ELEVATED",
          thresholdOffsetTheta: data.threshold_offset || 0.38,
          temperatureTau: data.temperature || 0.55,
          expectedHr: data.typical_hr || 74.0,
          expectedResp: data.typical_resp || 15.2,
          referenceDatasets: data.reference_datasets || ["shhs", "ucddb", "apnea_ecg"],
        },
      };
      setProfile(updated);
      setStep(4);
    } catch {
      // Fallback
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-card max-w-lg w-full p-6 space-y-5 text-[#F8FAFC]">
        {/* Modal Top Header */}
        <div className="flex justify-between items-center pb-3 border-b border-[#262C4E]">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#71B4FB] uppercase tracking-wider">
              Clinical Onboarding Wizard (Step {step} of 4)
            </span>
            <h3 className="text-base font-bold text-white">Sleep &amp; Cardiorespiratory Assessment</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1C203B] hover:bg-[#242B4D] flex items-center justify-center text-xs text-[#CBD5E1] cursor-pointer transition"
          >
            ✕
          </button>
        </div>

        {/* STEP 1: Fast Preset Persona or Custom */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-[#CBD5E1]">
              Select a clinical demo persona or configure custom patient characteristics:
            </p>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: "natasha", name: "Natasha (58)", sub: "Snoring / Mild", icon: "👩" },
                { id: "alex",    name: "Alex (26)",    sub: "Athlete / Low HR", icon: "🏃" },
                { id: "mihai",   name: "Mihai (49)",   sub: "High Apnea Index", icon: "👨" },
              ].map((p) => (
                <div
                  key={p.id}
                  onClick={() => selectPersona(p.id)}
                  className={`p-3 rounded-2xl border text-center cursor-pointer transition ${
                    profile.userName.toLowerCase() === p.id
                      ? "bg-[#71B4FB]/20 border-[#71B4FB] text-white"
                      : "bg-[#080A12] border-[#262C4E] text-[#7FA8B8] hover:border-[#71B4FB]/50"
                  }`}
                >
                  <span className="text-2xl block mb-1">{p.icon}</span>
                  <p className="text-xs font-bold text-white">{p.name}</p>
                  <p className="text-[10px] text-[#7FA8B8]">{p.sub}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] text-[#7FA8B8]">Patient Name</label>
                  <input
                    type="text"
                    value={profile.userName}
                    onChange={(e) => setProfile({ ...profile, userName: e.target.value })}
                    className="w-full bg-[#080A12] border border-[#262C4E] rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div className="w-24 space-y-1">
                  <label className="text-[11px] text-[#7FA8B8]">Age</label>
                  <input
                    type="number"
                    value={profile.age}
                    onChange={(e) => setProfile({ ...profile, age: parseInt(e.target.value) || 30 })}
                    className="w-full bg-[#080A12] border border-[#262C4E] rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 bg-[#71B4FB] hover:bg-[#88C3FD] text-[#080A12] rounded-2xl text-xs font-bold transition cursor-pointer"
            >
              Next: Sleep Symptoms →
            </button>
          </div>
        )}

        {/* STEP 2: Sleep & Postural Symptoms */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Dominant Sleep Posture</label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { id: "back", label: "Supine (Back)", icon: "🛌" },
                  { id: "side", label: "Lateral (Side)", icon: "🌙" },
                  { id: "stomach", label: "Prone (Stomach)", icon: "🛏️" },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() => setProfile({ ...profile, sleepPosition: pos.id as any })}
                    className={`p-2.5 rounded-xl border text-center font-semibold transition cursor-pointer ${
                      profile.sleepPosition === pos.id
                        ? "bg-[#71B4FB]/20 border-[#71B4FB] text-[#71B4FB]"
                        : "bg-[#080A12] border-[#262C4E] text-[#7FA8B8]"
                    }`}
                  >
                    <span className="block text-base">{pos.icon}</span>
                    <span className="text-[10px]">{pos.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Snoring Frequency</label>
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                {["Never", "Rarely", "Often", "Every Night"].map((lvl, idx) => (
                  <button
                    key={lvl}
                    onClick={() => setProfile({ ...profile, snoreFrequency: idx })}
                    className={`py-2 rounded-xl border text-center font-semibold transition cursor-pointer ${
                      profile.snoreFrequency === idx
                        ? "bg-[#FA8C73]/20 border-[#FA8C73] text-[#FA8C73]"
                        : "bg-[#080A12] border-[#262C4E] text-[#7FA8B8]"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-3 bg-[#1C203B] text-[#CBD5E1] rounded-2xl text-xs font-bold cursor-pointer"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 py-3 bg-[#71B4FB] hover:bg-[#88C3FD] text-[#080A12] rounded-2xl text-xs font-bold transition cursor-pointer"
              >
                Next: Clinical STOP-BANG →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: STOP-BANG Assessment */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2 text-xs">
              <label className="font-semibold text-white">Do you experience nocturnal choking / gasping?</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setProfile({ ...profile, chokingAwakenings: true })}
                  className={`flex-1 py-2.5 rounded-xl border font-bold transition cursor-pointer ${
                    profile.chokingAwakenings
                      ? "bg-[#FF5E7E]/20 border-[#FF5E7E] text-[#FF5E7E]"
                      : "bg-[#080A12] border-[#262C4E] text-[#7FA8B8]"
                  }`}
                >
                  Yes (Frequent Gasps)
                </button>
                <button
                  onClick={() => setProfile({ ...profile, chokingAwakenings: false })}
                  className={`flex-1 py-2.5 rounded-xl border font-bold transition cursor-pointer ${
                    !profile.chokingAwakenings
                      ? "bg-[#10B981]/20 border-[#10B981] text-[#10B981]"
                      : "bg-[#080A12] border-[#262C4E] text-[#7FA8B8]"
                  }`}
                >
                  No
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-3 bg-[#1C203B] text-[#CBD5E1] rounded-2xl text-xs font-bold cursor-pointer"
              >
                ← Back
              </button>
              <button
                onClick={handleEvaluate}
                disabled={loading}
                className="flex-1 py-3 bg-gradient-to-r from-[#10B981] to-[#71B4FB] text-[#080A12] rounded-2xl text-xs font-bold transition cursor-pointer shadow-lg shadow-[#10B981]/20"
              >
                {loading ? "Calibrating 206k Hours Model..." : "⚡ Calibrate Foundation Baseline"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Calibrated Cohort Results */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-[#10B981]/15 to-[#71B4FB]/10 border border-[#10B981]/30 rounded-3xl p-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#10B981]">✓ Baseline Model Calibrated</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#10B981]/20 text-[#10B981] font-bold">
                  206,318 HOURS REGISTRY
                </span>
              </div>

              <h4 className="text-base font-extrabold text-white">{profile.matchedCohort?.cohortName}</h4>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">{profile.matchedCohort?.cohortDescription}</p>

              <div className="grid grid-cols-2 gap-2 text-center text-xs pt-1">
                <div className="bg-[#080A12] p-2.5 rounded-xl border border-[#262C4E]">
                  <p className="text-[10px] text-[#7FA8B8]">Expected Resting HR</p>
                  <p className="text-base font-bold font-mono text-[#71B4FB]">{profile.matchedCohort?.expectedHr} BPM</p>
                </div>
                <div className="bg-[#080A12] p-2.5 rounded-xl border border-[#262C4E]">
                  <p className="text-[10px] text-[#7FA8B8]">Expected Respiration</p>
                  <p className="text-base font-bold font-mono text-[#00F2FE]">{profile.matchedCohort?.expectedResp} RPM</p>
                </div>
                <div className="bg-[#080A12] p-2.5 rounded-xl border border-[#262C4E]">
                  <p className="text-[10px] text-[#7FA8B8]">Learned Threshold (θ)</p>
                  <p className="text-base font-bold font-mono text-[#9D4EDD]">{profile.matchedCohort?.thresholdOffsetTheta.toFixed(2)}</p>
                </div>
                <div className="bg-[#080A12] p-2.5 rounded-xl border border-[#262C4E]">
                  <p className="text-[10px] text-[#7FA8B8]">Temperature (τ)</p>
                  <p className="text-base font-bold font-mono text-[#FA8C73]">{profile.matchedCohort?.temperatureTau.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => onComplete(profile)}
              className="w-full py-3.5 bg-[#10B981] text-[#080A12] rounded-2xl text-xs font-bold hover:brightness-110 active:scale-95 transition cursor-pointer"
            >
              Apply Calibrated Profile &amp; Launch Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
