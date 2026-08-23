"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface NetworkInfo {
  primary_ip: string;
  all_ips: string[];
  mobile_url: string;
  backend_url: string;
  qr_pairing_code: string;
}

export default function QrCodePairingCard({ onClose }: { onClose?: () => void }) {
  const [netInfo, setNetInfo] = useState<NetworkInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/network_info")
      .then((res) => res.json())
      .then(async (data: NetworkInfo) => {
        setNetInfo(data);
        const urlToEncode = data.mobile_url || (typeof window !== "undefined" ? window.location.origin : "http://localhost:6767");
        const qrUrl = await QRCode.toDataURL(urlToEncode, {
          width: 200,
          margin: 1,
          color: {
            dark: "#080A12",
            light: "#FFFFFF",
          },
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(qrUrl);
        setLoading(false);
      })
      .catch(async () => {
        const fallbackUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:6767";
        const qrUrl = await QRCode.toDataURL(fallbackUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: "#080A12",
            light: "#FFFFFF",
          },
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(qrUrl);
        setLoading(false);
      });
  }, []);

  const handleCopy = () => {
    const url = netInfo?.mobile_url || (typeof window !== "undefined" ? window.location.origin : "http://localhost:6767");
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const mobileUrl = netInfo?.mobile_url || (typeof window !== "undefined" ? window.location.origin : "http://localhost:6767");

  return (
    <div className="glass-card p-5 space-y-4 max-w-sm w-full text-[#F8FAFC]">
      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-[#262C4E]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#71B4FB]/15 border border-[#71B4FB]/30 flex items-center justify-center text-base">
            📱
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Connect Phone</h3>
            <p className="text-[10px] text-[#7FA8B8]">Bedside Audio &amp; Mobile UI</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-xl bg-[#1C203B] hover:bg-[#242B4D] flex items-center justify-center text-xs text-[#CBD5E1] cursor-pointer transition"
          >
            ✕
          </button>
        )}
      </div>

      {/* QR Code Container */}
      <div className="flex flex-col items-center justify-center p-4 bg-[#080A12] rounded-2xl border border-[#262C4E]">
        {loading || !qrDataUrl ? (
          <div className="h-40 w-40 flex flex-col items-center justify-center gap-2 text-xs text-[#7FA8B8]">
            <div className="w-6 h-6 border-2 border-[#71B4FB] border-t-transparent rounded-full animate-spin" />
            <span>Generating QR Code...</span>
          </div>
        ) : (
          <div className="p-2.5 bg-white rounded-2xl shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="Scan with phone"
              className="w-36 h-36 object-contain rounded-lg"
            />
          </div>
        )}
        <div className="mt-3 text-center">
          <span className="text-[11px] px-3 py-1 rounded-full font-mono font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
            PAIRING CODE: {netInfo?.qr_pairing_code || "LIFE-505"}
          </span>
        </div>
      </div>

      {/* Instructions */}
      <div className="space-y-1.5 text-[11px] text-[#CBD5E1] bg-[#1C203B]/60 p-3 rounded-2xl border border-[#262C4E]/50">
        <p className="flex items-start gap-2">
          <span className="w-4 h-4 rounded-full bg-[#71B4FB]/20 text-[#71B4FB] font-bold text-[10px] flex items-center justify-center flex-shrink-0">1</span>
          <span>Scan with your phone camera on the same Wi-Fi.</span>
        </p>
        <p className="flex items-start gap-2">
          <span className="w-4 h-4 rounded-full bg-[#10B981]/20 text-[#10B981] font-bold text-[10px] flex items-center justify-center flex-shrink-0">2</span>
          <span>Phone acts as <strong>Bedside Microphone</strong> for snoring acoustic analysis.</span>
        </p>
        <p className="flex items-start gap-2">
          <span className="w-4 h-4 rounded-full bg-[#9D4EDD]/20 text-[#9D4EDD] font-bold text-[10px] flex items-center justify-center flex-shrink-0">3</span>
          <span>PC receives ECG stream via USB Blue Cable.</span>
        </p>
      </div>

      {/* Direct Link + Copy */}
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={mobileUrl}
          className="flex-1 bg-[#1C203B] border border-[#262C4E] rounded-xl px-3 py-1.5 text-[11px] font-mono text-[#71B4FB] select-all outline-none"
        />
        <button
          onClick={handleCopy}
          className="px-3.5 py-1.5 bg-[#71B4FB] hover:bg-[#88C3FD] text-[#080A12] rounded-xl text-xs font-bold active:scale-95 transition cursor-pointer flex items-center gap-1"
        >
          <span>{copied ? "✓" : "📋"}</span>
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}
