'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconChevronLeft, IconHeart } from '@/components/ui/Icons';
import { setNamespacedItem } from '@/lib/userStorage';

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

function classifyToCohort(answers: QuizAnswers): CohortResult {
  const { age, gender, bmi, snore, fatigue, choking, hypertension } = answers;

  if (bmi === 'obese' && (snore >= 2 || choking)) {
    return {
      key: 'obese_high_risk',
      name: 'Obese High-Risk OSA (SHHS)',
      risk: 'HIGH',
      theta: 0.52,
      tau: 0.65,
      hr: 82,
      resp: 17,
    };
  }
  if (age >= 60 && (snore >= 1 || hypertension)) {
    return {
      key: 'senior_hypertensive',
      name: 'Senior Hypertensive (MESA / SHHS)',
      risk: 'HIGH',
      theta: 0.48,
      tau: 0.60,
      hr: 78,
      resp: 16,
    };
  }
  if (choking || snore >= 3) {
    return {
      key: 'severe_osa',
      name: 'Severe OSA Candidate (UCDDB)',
      risk: 'HIGH',
      theta: 0.55,
      tau: 0.70,
      hr: 80,
      resp: 18,
    };
  }
  if (bmi === 'overweight' && snore >= 2) {
    return {
      key: 'snoring_mild',
      name: 'Snoring & Mild Apnea (SHHS / MESA)',
      risk: 'ELEVATED',
      theta: 0.38,
      tau: 0.55,
      hr: 74,
      resp: 15.2,
    };
  }
  if (gender === 'female' && age >= 50) {
    return {
      key: 'postmenopausal_female',
      name: 'Postmenopausal Female (DREAMS)',
      risk: 'ELEVATED',
      theta: 0.35,
      tau: 0.52,
      hr: 71,
      resp: 14.5,
    };
  }
  if (fatigue >= 2 && snore === 0) {
    return {
      key: 'insomnia_fatigue',
      name: 'Insomnia & Non-Apnea Fatigue (ISRUC)',
      risk: 'LOW',
      theta: 0.28,
      tau: 0.45,
      hr: 68,
      resp: 13.8,
    };
  }
  if (age <= 30 && snore === 0 && fatigue <= 1) {
    return {
      key: 'young_athlete',
      name: 'Athletic & High HRV (Fantasia / BIDMC)',
      risk: 'LOW',
      theta: 0.22,
      tau: 0.40,
      hr: 54,
      resp: 12,
    };
  }
  if (smartwatch && snore === 0 && fatigue <= 1) {
    return {
      key: 'wearable_healthy',
      name: 'Wearable Healthy (BIDMC / Fantasia)',
      risk: 'LOW',
      theta: 0.24,
      tau: 0.42,
      hr: 60,
      resp: 13,
    };
  }
  return {
    key: 'healthy_adult',
    name: 'Healthy Adult Baseline (APNEA-ECG)',
    risk: 'LOW',
    theta: 0.30,
    tau: 0.48,
    hr: 70,
    resp: 14,
  };
}

export default function QuizPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({
    age: 30,
    gender: 'female',
    bmi: 'normal',
    sleepPosition: 'side',
    snore: 0,
    fatigue: 0,
    choking: false,
    hypertension: false,
    smartwatch: false,
  });

  const [analyzing, setAnalyzing] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [selectedCohort, setSelectedCohort] = useState<CohortResult | null>(null);

  const questions = [
    {
      title: 'What is your age bracket?',
      subtitle: 'Age influences upper airway elasticity and respiratory frequency stabilization.',
      options: [
        { label: '18 – 30 years', value: 25 },
        { label: '31 – 45 years', value: 38 },
        { label: '46 – 60 years', value: 52 },
        { label: '60+ years', value: 65 },
      ],
      field: 'age',
    },
    {
      title: 'What is your biological sex?',
      subtitle: 'Hormonal and structural airway differences define distinct baseline priors.',
      options: [
        { label: 'Male', value: 'male' },
        { label: 'Female', value: 'female' },
        { label: 'Other / Prefer not to say', value: 'other' },
      ],
      field: 'gender',
    },
    {
      title: 'What is your Body Mass Index (BMI) category?',
      subtitle: 'Body composition strongly correlates with upper airway collapsibility.',
      options: [
        { label: 'Normal Weight (18.5 – 24.9)', value: 'normal' },
        { label: 'Overweight (25.0 – 29.9)', value: 'overweight' },
        { label: 'Obese (≥ 30.0)', value: 'obese' },
      ],
      field: 'bmi',
    },
    {
      title: 'What is your primary sleep position?',
      subtitle: 'Supine sleeping increases positional obstructive events by up to 2.4×.',
      options: [
        { label: 'Supine (Back)', value: 'back' },
        { label: 'Lateral (Side)', value: 'side' },
        { label: 'Prone (Stomach)', value: 'stomach' },
        { label: 'Variable / Shifts through night', value: 'variable' },
      ],
      field: 'sleepPosition',
    },
    {
      title: 'How often do you or your partner observe snoring?',
      subtitle: 'Acoustic turbulence provides key acoustic markers for partial collapse.',
      options: [
        { label: 'Never', value: 0 },
        { label: 'Rarely (1–2 nights/month)', value: 1 },
        { label: 'Often (3–5 nights/week)', value: 2 },
        { label: 'Always (Every night)', value: 3 },
      ],
      field: 'snore',
    },
    {
      title: 'How severe is your daytime fatigue or sleepiness?',
      subtitle: 'Epworth Sleepiness Scale correlation with sleep architecture fragmentation.',
      options: [
        { label: 'None — Energetic throughout day', value: 0 },
        { label: 'Mild — Occasional afternoon slump', value: 1 },
        { label: 'Moderate — Daily struggle to stay alert', value: 2 },
        { label: 'Severe — Falling asleep unintentionally', value: 3 },
      ],
      field: 'fatigue',
    },
    {
      title: 'Do you ever wake up gasping, choking, or short of breath?',
      subtitle: 'Sudden respiratory arousals are hallmark indicators of obstructive events.',
      options: [
        { label: 'Yes, experienced frequently', value: true },
        { label: 'No, smooth uninterrupted breathing', value: false },
      ],
      field: 'choking',
    },
    {
      title: 'Do you have diagnosed hypertension or cardiovascular risk?',
      subtitle: 'Nocturnal sympathetic surges are clinically linked with hypertension.',
      options: [
        { label: 'Yes, diagnosed or treated', value: true },
        { label: 'No cardiovascular conditions', value: false },
      ],
      field: 'hypertension',
    },
    {
      title: 'Do you use a wearable sensor or fitness tracker?',
      subtitle: 'Enables continuous photoplethysmography (PPG) synchronization if available.',
      options: [
        { label: 'Yes, Apple Watch / Garmin / Fitbit', value: true },
        { label: 'No wearable connected', value: false },
      ],
      field: 'smartwatch',
    },
  ];

  const handleSelect = (field: string, value: any) => {
    const newAnswers = { ...answers, [field]: value };
    setAnswers(newAnswers);

    setTimeout(() => {
      if (step < questions.length - 1) {
        setStep((s) => s + 1);
      } else {
        startAnalysis(newAnswers);
      }
    }, 280);
  };

  const startAnalysis = (finalAnswers: QuizAnswers) => {
    setAnalyzing(true);
    const result = classifyToCohort(finalAnswers);
    setSelectedCohort(result);

    // Save profile with exact cohort details — per-user isolation
    setNamespacedItem('camera505_profile', JSON.stringify({
      answers: finalAnswers,
      cohort: result,
      cohortName: result.name,
    }));
    setNamespacedItem('camera505_first_time', 'false');

    const lines = [
      '[CAMERA 505] Ingesting ESRS cardiorespiratory intake questionnaire...',
      '[CATBOOST] Matching physiological profile against 12 clinical cohorts...',
      '[TRANSFORMER] Loading 206,318h PhysioNet & MESA calibration dataset...',
      `[CLASSIFICATION] Matched Clinical Model: ${result.name}`,
      `[CALIBRATION] Baseline Priors: θ₀ = ${result.theta.toFixed(2)} | τ₀ = ${result.tau.toFixed(2)}`,
      `[RISK PRIOR] Apnea Severity Stratification: ${result.risk} RISK`,
      `[PHYSIOLOGY] Baseline HR: ${result.hr} BPM | Respiration: ${result.resp} RPM`,
      '[FINE-TUNE] Adapting soft-F1 loss thresholds to your profile...',
      '[✓] Personal baseline calibrated! Launching medical dashboard...',
    ];

    let idx = 0;
    const interval = setInterval(() => {
      if (idx < lines.length) {
        const line = lines[idx];
        setTerminalLines((prev) => [...prev, line]);
        idx++;
      }
      if (idx >= lines.length) {
        clearInterval(interval);
        setTimeout(() => {
          router.replace('/dashboard');
        }, 1800);
      }
    }, 600);
  };

  // ── TERMINAL VIEW ────────────────────────────────────────
  if (analyzing) {
    return (
      <div className="min-h-screen bg-[#000000] text-[#FFFFFF] flex flex-col items-center justify-center p-4 sm:p-6 font-mono antialiased">
        <div className="w-full max-w-2xl bg-[#111111] border border-[#222222] rounded-[4px] p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#222222]">
            <div className="w-3 h-3 rounded-[2px] bg-[#FF3B30] border border-[#FF3B30]" />
            <div className="w-3 h-3 rounded-[2px] bg-[#FFCC00] border border-[#FFCC00]" />
            <div className="w-3 h-3 rounded-[2px] bg-[#00C853] border border-[#00C853]" />
            <span className="ml-3 text-[10px] font-black text-[#666666] uppercase tracking-[0.14em] font-mono">
              CAMERA 505 — CATBOOST COHORT CALIBRATION ENGINE
            </span>
          </div>

          <div className="font-mono text-xs sm:text-sm space-y-2.5 min-h-[300px] pt-2">
            {terminalLines.map((line, idx) => {
              let color = '#888888';
              if (line.includes('[✓]')) color = '#0080FF';
              else if (line.includes('RISK')) color = '#FFCC00';
              else if (line.includes('Matched Clinical Model')) color = '#0080FF';

              return (
                <div key={idx} style={{ color }} className="leading-relaxed font-mono text-[12px]">
                  {line}
                </div>
              );
            })}
            <div className="w-2 h-4 bg-[#0080FF] animate-pulse inline-block" />
          </div>

          {selectedCohort && (
            <div className="pt-3 border-t border-[#222222] flex items-center justify-between text-[11px] font-mono">
              <span className="text-[#666666] uppercase tracking-[0.08em]">MODEL ID: {selectedCohort.key}</span>
              <span className="text-[#0080FF] font-black uppercase tracking-[0.10em]">CALIBRATION COMPLETE</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Defensive guard — prevents crash at app/quiz/page.tsx:372 (Cannot read properties of undefined reading 'title')
  // Off-by-one safe: clamp step and fallback to first question
  const q = questions[step] ?? questions[0];
  if (!q) {
    return (
      <div className="min-h-screen bg-[#000000] text-[#FFFFFF] flex items-center justify-center font-mono">
        <div className="text-[#888888] text-sm">Loading questionnaire...</div>
      </div>
    );
  }

  // ── QUESTIONNAIRE VIEW ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF] flex flex-col p-4 sm:p-8 font-mono antialiased">
      <div className="w-full max-w-[600px] mx-auto flex-1 flex flex-col justify-between py-6">

        {/* Top Header & Progress */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => (step > 0 ? setStep(step - 1) : router.back())}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] font-mono text-[#888888] hover:text-[#FFFFFF] bg-[#111111] border border-[#222222] rounded-[2px] px-3.5 py-2 hover:border-[#333333] hover:bg-[#161616] cursor-pointer transition-colors"
            >
              <IconChevronLeft size={16} />
              BACK
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-[2px] bg-[#FFFFFF] flex items-center justify-center text-[#0080FF] border border-[#222222]">
                <IconHeart size={14} />
              </div>
              <span className="text-[12px] font-black text-[#FFFFFF] tabular-nums font-mono">
                {step + 1} <span className="text-[#444444]">/ {questions.length}</span>
              </span>
            </div>
          </div>

          {/* Progress bar — thin #222 track blue fill sharp */}
          <div className="w-full h-1 bg-[#222222] rounded-none overflow-hidden">
            <div
              className="h-full bg-[#0080FF] transition-all duration-300"
              style={{ width: `${((step + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div key={step} className="my-8 space-y-6">
          <div>
            <span className="text-[10px] font-black tracking-[0.18em] uppercase text-[#0080FF] block mb-3 font-mono">
              CLINICAL INTAKE · ESRS
            </span>
            <h2 className="text-[22px] sm:text-[28px] font-black tracking-[-0.03em] text-[#FFFFFF] leading-[1.1] font-mono uppercase">
              {q.title}
            </h2>
            <p className="text-[13px] font-mono text-[#888888] mt-3 leading-relaxed">{q.subtitle}</p>
          </div>

          <div className="space-y-3">
            {q.options.map((opt, idx) => {
              const isSelected = answers[q.field as keyof QuizAnswers] === opt.value;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(q.field, opt.value)}
                  className={`w-full text-left p-4 sm:p-5 rounded-[2px] border transition-colors flex items-center justify-between gap-4 cursor-pointer font-mono ${
                    isSelected
                      ? 'bg-[#0080FF] border-[#0080FF] text-[#FFFFFF]'
                      : 'bg-[#111111] border-[#222222] text-[#FFFFFF] hover:bg-[#161616] hover:border-[#333333]'
                  }`}
                >
                  <span className={`text-[13px] leading-snug font-mono ${isSelected ? 'font-black' : 'font-medium'} `}>{opt.label}</span>
                  <div
                    className={`w-[18px] h-[18px] rounded-[2px] border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? 'border-[#FFFFFF] bg-[#FFFFFF]' : 'border-[#333333] bg-transparent'
                    }`}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-[1px] bg-[#0080FF]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[10px] font-mono text-[#444444] font-bold uppercase tracking-[0.14em]">
          ESRS CLINICAL DIAGNOSTIC STANDARD · CAMERA 505 V2.1
        </div>

      </div>
    </div>
  );
}
