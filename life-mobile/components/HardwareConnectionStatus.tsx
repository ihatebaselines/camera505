"use client";

import { useEffect, useState } from "react";

interface Props {
  activeScenario: string;
  onScenarioChange: (scenario: string) => void;
  sourceType: string;
  onSourceChange: (source: "synthetic" | "serial") => void;
}

export default function HardwareConnectionStatus({
  activeScenario,
  onScenarioChange,
  sourceType,
  onSourceChange,
}: Props) {
  const [comPorts, setComPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [connecting, setConnecting] = useState(false);

  const fetchComPorts = () => {
    fetch("/api/com_ports")
      .then((res) => res.json())
      .then((data) => {
        const ports: string[] = data.ports || [];
        setComPorts(ports);
        if (ports.length > 0 && !selectedPort) {
          setSelectedPort(ports[0]);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchComPorts();
    const interval = setInterval(fetchComPorts, 4000);
    return () => clearInterval(interval);
  }, [selectedPort]);

  const handleConnectHardware = async () => {
    setConnecting(true);
    try {
      await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "demo_user",
          mode: "dual",
          source_type: "serial",
          com_port: selectedPort,
          baud_rate: 115200,
        }),
      });
      onSourceChange("serial");
    } catch {
    } finally {
      setConnecting(false);
    }
  };

  const handleFallbackSynthetic = async () => {
    try {
      await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "demo_user",
          mode: "dual",
          source_type: "synthetic",
        }),
      });
      onSourceChange("synthetic");
    } catch {}
  };

  return (
    <div className="glass-card p-4 space-y-3 text-[#F8FAFC]">
      {/* Header */}
      <div className="flex justify-between items-center pb-1 border-b border-[#262C4E]">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔌</span>
          <div>
            <h3 className="text-xs font-bold text-white">Hardware Bridge</h3>
            <p className="text-[10px] text-[#7FA8B8]">AD8232 ECG (250Hz) + ESP32</p>
          </div>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
            sourceType === "serial"
              ? "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40"
              : "bg-[#71B4FB]/15 text-[#71B4FB] border border-[#71B4FB]/30"
          }`}
        >
          {sourceType === "serial" ? "USB SERIAL LIVE" : "SYNTHETIC ENGINE"}
        </span>
      </div>

      {/* USB Hardware Detection Box */}
      <div className="bg-[#080A12] rounded-xl p-3 space-y-2 text-xs border border-[#262C4E]">
        <div className="flex justify-between items-center">
          <span className="text-[#CBD5E1] font-semibold">USB Blue Cable (COM Port):</span>
          <button
            onClick={fetchComPorts}
            className="text-[10px] text-[#71B4FB] hover:underline cursor-pointer"
          >
            Scan Ports 🔄
          </button>
        </div>

        {comPorts.length > 0 ? (
          <div className="flex gap-2">
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              className="flex-1 bg-[#121528] border border-[#262C4E] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
            >
              {comPorts.map((p) => (
                <option key={p} value={p}>
                  {p} (ESP32)
                </option>
              ))}
            </select>
            <button
              onClick={handleConnectHardware}
              disabled={connecting}
              className="px-3 py-1.5 bg-[#10B981] text-[#080A12] rounded-lg text-xs font-bold hover:brightness-110 active:scale-95 transition cursor-pointer"
            >
              {connecting ? "Connecting..." : "Connect USB"}
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[11px] text-[#F59E0B] flex items-center gap-1.5">
              <span>⚠️</span> Waiting for USB Blue Cable to be plugged into PC.
            </p>
            <p className="text-[10px] text-[#7FA8B8]">
              Plug ESP32 into USB to stream real 250Hz ECG from GPIO 34 (LO+ GPIO 33, LO- GPIO 32).
            </p>
          </div>
        )}

        {sourceType === "serial" && (
          <button
            onClick={handleFallbackSynthetic}
            className="w-full mt-1 text-[11px] text-[#7FA8B8] hover:text-white underline text-center cursor-pointer"
          >
            Switch back to synthetic test generator
          </button>
        )}
      </div>

      {/* Simulation Scenario Switcher */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-[#71B4FB] uppercase tracking-wider">
          Demo Simulation Scenarios
        </p>
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          {[
            { id: "HEALTHY_REST", label: "Healthy Rest" },
            { id: "SLEEP_APNEA", label: "Sleep Apnea" },
            { id: "ARRHYTHMIA", label: "Arrhythmia" },
            { id: "COUGH_ATTACK", label: "Cough Attack" },
            { id: "SNORING_EPISODE", label: "Snoring" },
            { id: "LEADS_OFF", label: "Leads Off" },
          ].map((sc) => (
            <button
              key={sc.id}
              onClick={() => onScenarioChange(sc.id)}
              className={`p-1.5 rounded-lg text-center font-semibold transition cursor-pointer ${
                activeScenario === sc.id
                  ? "bg-[#71B4FB]/20 text-[#71B4FB] border border-[#71B4FB]/50"
                  : "bg-[#080A12] text-[#7FA8B8] border border-[#262C4E] hover:text-white"
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
