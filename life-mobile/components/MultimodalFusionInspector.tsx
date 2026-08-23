"use client";

interface Props {
  hrBpm: number;
  respRpm: number;
  snoreProb: number;
  anomalyScore: number;
  riskLevel: string;
  cohortName: string;
  sourceType: string;
  micActive: boolean;
}

export default function MultimodalFusionInspector({
  hrBpm,
  respRpm,
  snoreProb,
  anomalyScore,
  riskLevel,
  cohortName,
  sourceType,
  micActive,
}: Props) {
  const isApneaSuspect = (snoreProb > 0.6 || respRpm > 22 || respRpm < 8) && anomalyScore > 0.35;

  return (
    <div className="glass-card p-4 space-y-3 text-[#F8FAFC]">
      {/* Header */}
      <div className="flex justify-between items-center pb-1 border-b border-[#262C4E]">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <div>
            <h3 className="text-xs font-bold text-white">Multimodal AI Fusion Engine</h3>
            <p className="text-[10px] text-[#7FA8B8]">ECG Transformer (1D CNN) + Audio Mel AST</p>
          </div>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
            riskLevel === "HIGH"
              ? "bg-[#FF5E7E]/20 text-[#FF5E7E] border border-[#FF5E7E]/40"
              : riskLevel === "ELEVATED"
              ? "bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40"
              : "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40"
          }`}
        >
          RISK: {riskLevel}
        </span>
      </div>

      {/* Dual Sensor Branches */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {/* ECG Branch */}
        <div className="bg-[#080A12] rounded-xl p-2.5 space-y-1 border border-[#262C4E]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#FF5E7E] flex items-center gap-1">
              ❤️ ECG Branch
            </span>
            <span className="text-[9px] font-mono text-[#7FA8B8]">250 Hz</span>
          </div>
          <p className="text-[10px] text-[#CBD5E1]">1D CNN → 60 Tokens (Stride 125)</p>
          <div className="pt-1 flex justify-between font-mono text-[10px] text-[#7FA8B8]">
            <span>HR: <strong className="text-[#FF5E7E]">{hrBpm > 0 ? hrBpm.toFixed(0) : "—"}</strong> BPM</span>
            <span>EDR: <strong className="text-[#00F2FE]">{respRpm.toFixed(1)}</strong> RPM</span>
          </div>
        </div>

        {/* Audio Branch */}
        <div className="bg-[#080A12] rounded-xl p-2.5 space-y-1 border border-[#262C4E]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#00F2FE] flex items-center gap-1">
              🎙️ Audio Branch
            </span>
            <span className="text-[9px] font-mono text-[#7FA8B8]">16 kHz</span>
          </div>
          <p className="text-[10px] text-[#CBD5E1]">128 Mel Bins → 60 Tokens</p>
          <div className="pt-1 flex justify-between font-mono text-[10px] text-[#7FA8B8]">
            <span>Snore: <strong className="text-[#FA8C73]">{(snoreProb * 100).toFixed(0)}%</strong></span>
            <span>Mic: <strong className={micActive ? "text-[#10B981]" : "text-[#7FA8B8]"}>{micActive ? "Live" : "Standby"}</strong></span>
          </div>
        </div>
      </div>

      {/* Multimodal Transformer Fusion Bar */}
      <div className="bg-[#080A12] rounded-xl p-2.5 border border-[#262C4E] space-y-1.5 text-xs">
        <div className="flex justify-between items-center text-[10px] text-[#7FA8B8]">
          <span>Cross-Modal Attention (121 Tokens)</span>
          <span className="font-mono text-[#71B4FB]">512-dim Temporal Embedding</span>
        </div>

        {/* Multimodal Confirmation Status */}
        <div className="p-2 rounded-lg bg-[#121528] border border-[#262C4E] text-[11px] flex items-center justify-between">
          <span className="text-[#CBD5E1]">Multimodal Verdict:</span>
          {isApneaSuspect ? (
            <span className="text-[#F59E0B] font-bold flex items-center gap-1">
              <span>⚠️</span> Suspected Event (ECG+Audio Confirmed)
            </span>
          ) : (
            <span className="text-[#10B981] font-bold flex items-center gap-1">
              <span>✓</span> Concordant Normal Baseline
            </span>
          )}
        </div>
      </div>

      {/* Active Baseline Cohort Info */}
      <div className="text-[10px] text-[#7FA8B8] flex justify-between items-center pt-0.5">
        <span>Active Cohort: <strong className="text-white">{cohortName}</strong></span>
        <span>206k Hours Registry</span>
      </div>
    </div>
  );
}
