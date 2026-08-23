"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  isActive: boolean;
  onToggle: (active: boolean) => void;
}

export default function MicrophoneAudioStreamer({ isActive, onToggle }: Props) {
  const [audioLevelDb, setAudioLevelDb]     = useState<number>(-60);
  const [snoreDetected, setSnoreDetected]   = useState<boolean>(false);
  const [statusMessage, setStatusMessage]   = useState<string>("Bedside Microphone Ready — phone or laptop mic");
  const [analyzingFile, setAnalyzingFile]   = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const uploadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pcmBufferRef = useRef<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const startMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });

      streamRef.current = stream;
      onToggle(true);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(ctx.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < inputData.length; i++) {
          pcmBufferRef.current.push(inputData[i]);
        }
      };

      uploadIntervalRef.current = setInterval(() => {
        if (pcmBufferRef.current.length >= 3200) {
          const chunk = pcmBufferRef.current.splice(0, 3200);
          fetch("/api/audio/upload_chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ samples: chunk, fs: 16000 }),
          }).catch(() => {});
        }
      }, 200);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);

        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i];
        }
        const rms = Math.sqrt(sum / data.length);
        const db = Math.round((rms / 255) * 60 - 60);
        setAudioLevelDb(db);

        const binHz = 16000 / analyserRef.current.fftSize;
        const snoreStartBin = Math.floor(80 / binHz);
        const snoreEndBin = Math.floor(500 / binHz);
        let snoreEnergy = 0;
        for (let b = snoreStartBin; b <= snoreEndBin; b++) {
          snoreEnergy += data[b] || 0;
        }
        const isSnoring = snoreEnergy / (snoreEndBin - snoreStartBin) > 90;
        setSnoreDetected(isSnoring);

        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();

      setStatusMessage("Streaming Bedside Audio (16 kHz) — correlated with ECG timeline");
    } catch {
      setStatusMessage("Microphone permission denied — allow mic for phone monitoring");
      onToggle(false);
    }
  };

  const stopMicrophone = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (uploadIntervalRef.current) {
      clearInterval(uploadIntervalRef.current);
      uploadIntervalRef.current = null;
    }
    onToggle(false);
    setStatusMessage("Bedside Microphone Paused");
    setAudioLevelDb(-60);
    setSnoreDetected(false);
  };

  useEffect(() => {
    if (isActive && !streamRef.current) {
      startMicrophone();
    } else if (!isActive && streamRef.current) {
      stopMicrophone();
    }
    return () => stopMicrophone();
  }, [isActive]);

  const handlePlayPreset = async (presetName: "snoring" | "cough" | "normal") => {
    setAnalyzingFile(true);
    setAnalysisResult("Synthesizing acoustic wave & feeding DSP...");
    try {
      const res = await fetch("/api/audio/upload_file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: presetName, duration_sec: 5.0 }),
      });
      const data = await res.json();
      setAnalysisResult(`✓ ${data.classification} (${data.duration_seconds}s segment analyzed) — aligned to ECG timebase`);
    } catch {
      setAnalysisResult("Analysis error — is backend on :8000 running?");
    } finally {
      setAnalyzingFile(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzingFile(true);
    setAnalysisResult(`Decoding ${file.name}...`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const tempCtx = new AudioCtx();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      const rawData = audioBuffer.getChannelData(0);

      // Resample to 16kHz if needed (simple decimation)
      const targetFs = 16000;
      const step = Math.max(1, Math.round(audioBuffer.sampleRate / targetFs));
      const resampled: number[] = [];
      for (let i = 0; i < rawData.length; i += step) {
        resampled.push(rawData[i]);
      }

      const res = await fetch("/api/audio/upload_file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: resampled }),
      });
      const data = await res.json();
      setAnalysisResult(`✓ ${data.classification} (${data.duration_seconds}s file) — time-aligned`);
      tempCtx.close();
    } catch {
      setAnalysisResult("Failed to decode audio file. Try a standard WAV or MP3.");
    } finally {
      setAnalyzingFile(false);
    }
  };

  const levelPercent = Math.min(100, Math.max(0, (audioLevelDb + 60) * 1.66));

  return (
    <div className="bg-[#111] border border-[#222] rounded-[2px] p-5 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center pb-3 border-b border-[#222]">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-[2px] flex items-center justify-center font-mono text-xs font-black border ${isActive ? 'bg-[#0E9F00]/10 text-[#0E9F00] border-[#0E9F00]/20' : 'bg-[#0A0A0A] text-[#555] border-[#222]'}`}>
            {isActive ? "●" : "○"}
          </div>
          <div>
            <h4 className="font-mono text-[11px] font-black tracking-[0.06em] uppercase text-white">BEDSIDE AUDIO STREAMER</h4>
            <p className="font-mono text-[11px] tracking-[0.04em] uppercase font-bold text-[#666]">{statusMessage.toUpperCase()}</p>
          </div>
        </div>
        <button
          onClick={() => onToggle(!isActive)}
          className={`px-4 py-2 rounded-[2px] font-mono text-[11px] font-black tracking-[0.06em] uppercase transition-colors cursor-pointer border ${
            isActive
              ? "bg-[#FF3333]/10 text-[#FF3333] border-[#FF3333]/30 hover:bg-[#FF3333] hover:text-white"
              : "bg-[#0080FF] text-white border-[#0080FF] hover:bg-[#0066CC] hover:border-[#0066CC]"
          }`}
        >
          {isActive ? "STOP MIC" : "ENABLE MIC"}
        </button>
      </div>

      {/* Real-time Level Meter */}
      {isActive && (
        <div className="space-y-2 pt-1">
          <div className="flex justify-between font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
            <span className="text-[#666]">LEVEL: {audioLevelDb} DB</span>
            <span className={snoreDetected ? "font-black text-[#FFB800]" : "text-[#0E9F00]"}>
              {snoreDetected ? "SNORE 80-500HZ" : "NORMAL BREATHING"}
            </span>
          </div>

          <div className="h-[8px] bg-[#222] rounded-[2px] overflow-hidden border border-[#222] p-[1px]">
            <div
              className={`h-full rounded-[1px] transition-all duration-75 ${
                levelPercent > 70 ? "bg-[#FF3333]" : levelPercent > 40 ? "bg-[#FFB800]" : "bg-[#0E9F00]"
              }`}
              style={{ width: `${levelPercent}%` }}
            />
          </div>
          <p className="font-mono text-[10px] tracking-[0.04em] uppercase font-bold text-[#555] leading-relaxed">
            AUDIO LA 16KHZ ESTE TRIMIS LA <code className="font-mono bg-[#0A0A0A] border border-[#222] px-1 rounded-[2px] text-[#888]">/api/audio/upload_chunk</code> ȘI CORELAT CU ECG-UL PE ACELAȘI CEAS (50HZ).
          </p>
        </div>
      )}

      {/* Presets & File Upload — existing sounds, correlated */}
      <div className="pt-1 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
          <span className="text-[#666]">PRESET-URI EXISTENTE (DEJA CORELATE):</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzingFile}
            className="text-[#0080FF] hover:text-white border border-transparent hover:border-[#0080FF] px-2 py-1 rounded-[2px] hover:bg-[#0080FF]/10 cursor-pointer flex items-center gap-1 font-black tracking-[0.06em]"
          >
            UPLOAD AUDIO (.WAV/.MP3)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
          <button
            onClick={() => handlePlayPreset("snoring")}
            disabled={analyzingFile}
            className="py-2.5 px-2 rounded-[2px] bg-[#0A0A0A] border border-[#333] hover:border-[#FFB800] text-[#666] hover:text-[#FFB800] transition-colors cursor-pointer text-center"
          >
            SNORING SAMPLE
          </button>
          <button
            onClick={() => handlePlayPreset("normal")}
            disabled={analyzingFile}
            className="py-2.5 px-2 rounded-[2px] bg-[#0A0A0A] border border-[#333] hover:border-[#0E9F00] text-[#666] hover:text-[#0E9F00] transition-colors cursor-pointer text-center"
          >
            NORMAL BREATH
          </button>
          <button
            onClick={() => handlePlayPreset("cough")}
            disabled={analyzingFile}
            className="py-2.5 px-2 rounded-[2px] bg-[#0A0A0A] border border-[#333] hover:border-[#FF3333] text-[#666] hover:text-[#FF3333] transition-colors cursor-pointer text-center"
          >
            COUGH BURST
          </button>
        </div>

        {analysisResult && (
          <p className="font-mono text-[11px] font-bold tracking-[0.04em] text-[#0E9F00] bg-[#0E9F00]/10 p-3 rounded-[2px] border border-[#0E9F00]/20 uppercase">
            {analysisResult.toUpperCase()}
          </p>
        )}
      </div>
    </div>
  );
}
