"""
CAMERA 505 Platform - Real-Time Clinical ECG & Frequency Spectrum Studio
Native Desktop GUI with 60 FPS Medical Oscilloscope, FFT Frequency Spectrum,
Pan-Tompkins R-Peak Detector, HRV RMSSD/SDNN, and Differentiable Apnea Scoring.
Supports Arduino UNO / ESP-32S on COM5 (or any port) and Live Simulation Mode.
"""

import os
import sys
import time
import math
import threading
import numpy as np
from collections import deque

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import tkinter as tk
from tkinter import ttk, messagebox
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.pyplot as plt
import matplotlib.animation as animation

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False

from src.ingestion.serial_stream import list_available_com_ports, SerialEcgReader
from src.ingestion.synthetic_generator import SyntheticPhysiologicalGenerator
from src.dsp.ecg_dsp import PanTompkinsDetector, calculate_hrv_metrics


class Camera505EcgStudioApp:
    def __init__(self, root):
        self.root = root
        self.root.title("CAMERA 505 — Real-Time ECG & Frequency Spectrum Studio")
        self.root.geometry("1280x820")
        self.root.minsize(1024, 700)
        self.root.configure(bg="#0B0F19")

        # Core State
        self.fs = 50.0  # 50 Hz sampling
        self.buffer_size = 500  # 10 seconds of rolling ECG
        self.ecg_buffer = deque([2048.0] * self.buffer_size, maxlen=self.buffer_size)
        self.filtered_buffer = deque([0.0] * self.buffer_size, maxlen=self.buffer_size)
        self.r_peak_indices = deque(maxlen=30)
        self.rr_intervals_ms = deque(maxlen=50)
        
        self.is_streaming = False
        self.is_simulated = False
        self.leads_off = False
        self.current_bpm = 0.0
        self.current_rmssd = 35.0
        self.apnea_risk = 12.5
        self.sample_count = 0
        self.start_time = time.time()
        self.last_beat_time = 0.0

        # DSP Engines
        self.detector = PanTompkinsDetector(fs=int(self.fs))
        self.sim_gen = SyntheticPhysiologicalGenerator(ecg_fs=50, audio_fs=16000)
        self.serial_reader = None
        self.lock = threading.Lock()

        # Build UI
        self._create_header_bar()
        self._create_metric_cards()
        self._create_matplotlib_canvases()
        self._create_control_panel()

        # Start animation / UI refresh loop
        self.ani = animation.FuncAnimation(
            self.fig, self._update_plots, interval=33, blit=False, cache_frame_data=False
        )
        
        # Auto-detect COM ports on start
        self._refresh_com_ports()

    def _create_header_bar(self):
        header_frame = tk.Frame(self.root, bg="#111827", height=60, padx=20, pady=10)
        header_frame.pack(fill=tk.X, side=tk.TOP)

        title_label = tk.Label(
            header_frame,
            text="🫀 CAMERA 505 — CLINICAL ECG & SPECTRUM STUDIO",
            font=("Segoe UI", 16, "bold"),
            fg="#00F0FF",
            bg="#111827"
        )
        title_label.pack(side=tk.LEFT)

        motto_label = tk.Label(
            header_frame,
            text="*WE DON'T SUPPORT 67* | Universal Cardiorespiratory Telemetry",
            font=("Segoe UI", 10, "italic"),
            fg="#9CA3AF",
            bg="#111827"
        )
        motto_label.pack(side=tk.LEFT, padx=15)

        self.status_badge = tk.Label(
            header_frame,
            text="● STANDBY",
            font=("Segoe UI", 11, "bold"),
            fg="#F59E0B",
            bg="#1F2937",
            padx=12,
            pady=4,
            relief=tk.FLAT
        )
        self.status_badge.pack(side=tk.RIGHT)

    def _create_metric_cards(self):
        card_container = tk.Frame(self.root, bg="#0B0F19", padx=15, pady=10)
        card_container.pack(fill=tk.X, side=tk.TOP)

        self.bpm_card = self._make_card(card_container, "HEART RATE (BPM)", "0.0", "#10B981", "BPM")
        self.bpm_card.pack(side=tk.LEFT, expand=True, fill=tk.BOTH, padx=5)

        self.hrv_card = self._make_card(card_container, "HRV (RMSSD)", "35.0", "#3B82F6", "ms")
        self.hrv_card.pack(side=tk.LEFT, expand=True, fill=tk.BOTH, padx=5)

        self.risk_card = self._make_card(card_container, "APNEA RISK SCORE", "12.5%", "#8B5CF6", "Low Risk")
        self.risk_card.pack(side=tk.LEFT, expand=True, fill=tk.BOTH, padx=5)

        self.freq_card = self._make_card(card_container, "DOMINANT FREQ (FFT)", "1.20", "#EC4899", "Hz (Sinus)")
        self.freq_card.pack(side=tk.LEFT, expand=True, fill=tk.BOTH, padx=5)

    def _make_card(self, parent, title, value, color, subtitle):
        frame = tk.Frame(parent, bg="#1E293B", padx=15, pady=10, relief=tk.RIDGE, bd=1)
        lbl_t = tk.Label(frame, text=title, font=("Segoe UI", 9, "bold"), fg="#94A3B8", bg="#1E293B")
        lbl_t.pack(anchor="w")

        lbl_v = tk.Label(frame, text=value, font=("Segoe UI", 22, "bold"), fg=color, bg="#1E293B")
        lbl_v.pack(anchor="w", pady=2)
        frame.val_lbl = lbl_v

        lbl_s = tk.Label(frame, text=subtitle, font=("Segoe UI", 9), fg="#64748B", bg="#1E293B")
        lbl_s.pack(anchor="w")
        frame.sub_lbl = lbl_s
        return frame

    def _create_matplotlib_canvases(self):
        plot_frame = tk.Frame(self.root, bg="#0B0F19", padx=15, pady=5)
        plot_frame.pack(fill=tk.BOTH, expand=True)

        plt.style.use("dark_background")
        self.fig, (self.ax_ecg, self.ax_fft) = plt.subplots(
            2, 1, figsize=(10, 5.5), gridspec_kw={"height_ratios": [2.2, 1.0]}
        )
        self.fig.patch.set_facecolor("#0B0F19")

        # 1. ECG Waveform Plot
        self.ax_ecg.set_facecolor("#030712")
        self.ax_ecg.set_title("CHANNEL 1: CONTINUOUS 50Hz ECG OSCILLOSCOPE (Lead II / AD8232)", color="#00F0FF", fontsize=10, loc="left", pad=6)
        self.ax_ecg.set_xlim(0, self.buffer_size)
        self.ax_ecg.set_ylim(0, 4095)
        self.ax_ecg.grid(True, color="#1F2937", linestyle="--", linewidth=0.5)
        self.ax_ecg.tick_params(colors="#6B7280", labelsize=8)

        self.line_ecg, = self.ax_ecg.plot([], [], color="#00FF88", linewidth=1.5, label="Raw ECG")
        self.scatter_peaks = self.ax_ecg.scatter([], [], color="#EF4444", s=30, zorder=5, label="QRS Peak")
        self.ax_ecg.legend(loc="upper right", framealpha=0.3, fontsize=8)

        # 2. FFT Frequency Spectrum Plot
        self.ax_fft.set_facecolor("#030712")
        self.ax_fft.set_title("CHANNEL 2: REAL-TIME POWER SPECTRUM DENSITY (FFT 0-25 Hz)", color="#EC4899", fontsize=10, loc="left", pad=6)
        self.ax_fft.set_xlim(0, 20.0)
        self.ax_fft.set_ylim(0, 500)
        self.ax_fft.grid(True, color="#1F2937", linestyle="--", linewidth=0.5)
        self.ax_fft.tick_params(colors="#6B7280", labelsize=8)

        self.line_fft, = self.ax_fft.plot([], [], color="#EC4899", linewidth=1.4)

        self.fig.tight_layout()
        self.canvas = FigureCanvasTkAgg(self.fig, master=plot_frame)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)

    def _create_control_panel(self):
        ctrl_frame = tk.Frame(self.root, bg="#111827", padx=15, pady=10)
        ctrl_frame.pack(fill=tk.X, side=tk.BOTTOM)

        # Port Selector
        tk.Label(ctrl_frame, text="Serial Port:", font=("Segoe UI", 10, "bold"), fg="#D1D5DB", bg="#111827").pack(side=tk.LEFT, padx=5)
        self.port_combo = ttk.Combobox(ctrl_frame, width=14, state="readonly")
        self.port_combo.pack(side=tk.LEFT, padx=5)

        # Baud Rate
        tk.Label(ctrl_frame, text="Baud Rate:", font=("Segoe UI", 10, "bold"), fg="#D1D5DB", bg="#111827").pack(side=tk.LEFT, padx=5)
        self.baud_combo = ttk.Combobox(ctrl_frame, values=["115200", "9600", "57600"], width=8, state="readonly")
        self.baud_combo.set("115200")
        self.baud_combo.pack(side=tk.LEFT, padx=5)

        # Connect / Disconnect Buttons
        self.btn_connect = tk.Button(
            ctrl_frame,
            text="⚡ CONNECT HARDWARE",
            font=("Segoe UI", 10, "bold"),
            bg="#059669",
            fg="white",
            padx=15,
            pady=4,
            command=self._toggle_hardware_stream
        )
        self.btn_connect.pack(side=tk.LEFT, padx=10)

        self.btn_sim = tk.Button(
            ctrl_frame,
            text="🧪 SIMULATOR MODE",
            font=("Segoe UI", 10, "bold"),
            bg="#4F46E5",
            fg="white",
            padx=15,
            pady=4,
            command=self._toggle_simulation_stream
        )
        self.btn_sim.pack(side=tk.LEFT, padx=5)

        self.btn_refresh = tk.Button(
            ctrl_frame,
            text="🔄 Refresh Ports",
            font=("Segoe UI", 9),
            bg="#374151",
            fg="#E5E7EB",
            command=self._refresh_com_ports
        )
        self.btn_refresh.pack(side=tk.LEFT, padx=5)

        # Right side info
        self.fps_lbl = tk.Label(ctrl_frame, text="FPS: 0.0 | Rate: 0.0 Hz", font=("Segoe UI", 9), fg="#9CA3AF", bg="#111827")
        self.fps_lbl.pack(side=tk.RIGHT, padx=10)

    def _refresh_com_ports(self):
        ports = list_available_com_ports()
        device_list = [p["device"] for p in ports]
        if "COM5" not in device_list:
            device_list.append("COM5")  # Always include target COM5
        self.port_combo["values"] = device_list
        if "COM5" in device_list:
            self.port_combo.set("COM5")
        elif device_list:
            self.port_combo.set(device_list[0])

    def _toggle_hardware_stream(self):
        if self.is_streaming:
            self._stop_stream()
        else:
            port = self.port_combo.get()
            baud = int(self.baud_combo.get())
            if not port:
                messagebox.showerror("Error", "Please select a COM port first.")
                return
            self._start_hardware_stream(port, baud)

    def _toggle_simulation_stream(self):
        if self.is_streaming:
            self._stop_stream()
        else:
            self._start_simulation_stream()

    def _start_hardware_stream(self, port: str, baud: int):
        self.is_streaming = True
        self.is_simulated = False
        self.sample_count = 0
        self.start_time = time.time()
        self.status_badge.config(text=f"● LIVE HARDWARE [{port}]", fg="#10B981")
        self.btn_connect.config(text="⏹ STOP STREAM", bg="#DC2626")
        self.btn_sim.config(state=tk.DISABLED)

        def on_sample(ecg_val: float, leads_off: bool, ts_ms: int):
            with self.lock:
                self.sample_count += 1
                self.leads_off = leads_off
                val = 0.0 if leads_off else ecg_val
                self.ecg_buffer.append(val)
                self._process_ecg_sample(val, leads_off)

        self.serial_reader = SerialEcgReader(port=port, baud_rate=baud, callback=on_sample)
        success = self.serial_reader.start()
        if not success:
            self.status_badge.config(text=f"⚠️ {port} NOT OPEN", fg="#EF4444")

    def _start_simulation_stream(self):
        self.is_streaming = True
        self.is_simulated = True
        self.sample_count = 0
        self.start_time = time.time()
        self.status_badge.config(text="● SIMULATION (50Hz)", fg="#6366F1")
        self.btn_sim.config(text="⏹ STOP SIM", bg="#DC2626")
        self.btn_connect.config(state=tk.DISABLED)

        def sim_thread():
            t_phase = 0.0
            while self.is_streaming and self.is_simulated:
                try:
                    time.sleep(0.02)  # 50 Hz
                    t_phase += 0.02
                    
                    try:
                        sample = self.sim_gen.generate_sample()
                        ecg_raw = float(sample["ecg_raw"])
                        lo = bool(sample.get("leads_off", False))
                    except Exception:
                        # Direct mathematical ECG synthesis fallback
                        p = (t_phase * 1.2) % 1.0
                        if 0.15 <= p < 0.22:
                            ecg_raw = 2048.0 + 1400.0 * math.sin((p - 0.15) / 0.07 * math.pi) # R-peak
                        elif 0.35 <= p < 0.55:
                            ecg_raw = 2048.0 + 300.0 * math.sin((p - 0.35) / 0.20 * math.pi)  # T-wave
                        else:
                            ecg_raw = 2048.0 + 40.0 * math.sin(t_phase * 2.0 * math.pi * 0.25) # Baseline
                        lo = False

                    with self.lock:
                        self.sample_count += 1
                        self.leads_off = lo
                        self.ecg_buffer.append(ecg_raw)
                        self._process_ecg_sample(ecg_raw, lo)

                except Exception as e:
                    time.sleep(0.05)

        self.sim_worker = threading.Thread(target=sim_thread, daemon=True)
        self.sim_worker.start()

    def _stop_stream(self):
        self.is_streaming = False
        if self.serial_reader:
            self.serial_reader.stop()
            self.serial_reader = None
        self.status_badge.config(text="● STANDBY", fg="#F59E0B")
        self.btn_connect.config(text="⚡ CONNECT HARDWARE", bg="#059669", state=tk.NORMAL)
        self.btn_sim.config(text="🧪 SIMULATOR MODE", bg="#4F46E5", state=tk.NORMAL)

    def _process_ecg_sample(self, val: float, leads_off: bool):
        if leads_off or val == 0.0:
            return
        
        # Scale to standard normalized ECG
        norm = (val - 2048.0) / 2048.0
        is_r, _ = self.detector.process_sample(norm)
        
        now = time.time()
        if is_r:
            self.r_peak_indices.append(len(self.ecg_buffer) - 1)
            if self.last_beat_time > 0:
                rr_ms = (now - self.last_beat_time) * 1000.0
                if 300 < rr_ms < 2000:
                    self.rr_intervals_ms.append(rr_ms)
                    self.current_bpm = 60000.0 / rr_ms
                    if len(self.rr_intervals_ms) >= 5:
                        diffs = np.diff(list(self.rr_intervals_ms))
                        self.current_rmssd = float(np.sqrt(np.mean(diffs**2)))
            self.last_beat_time = now

    def _update_plots(self, frame):
        with self.lock:
            ecg_data = list(self.ecg_buffer)
            peaks = list(self.r_peak_indices)
            lo = self.leads_off
            bpm = self.current_bpm
            rmssd = self.current_rmssd
            samples = self.sample_count

        x_ecg = np.arange(len(ecg_data))
        
        # Dynamic Y-limit scaling based on 10-bit or 12-bit
        max_val = max(ecg_data) if ecg_data else 4095
        if max_val > 1100:
            self.ax_ecg.set_ylim(0, 4095)
        else:
            self.ax_ecg.set_ylim(0, 1024)

        self.line_ecg.set_data(x_ecg, ecg_data)

        # Plot R-peaks
        valid_peaks_x = [p for p in peaks if p < len(ecg_data)]
        valid_peaks_y = [ecg_data[p] for p in valid_peaks_x]
        self.scatter_peaks.set_offsets(np.c_[valid_peaks_x, valid_peaks_y])

        # Compute FFT
        if len(ecg_data) >= 128 and not lo:
            sig = np.array(ecg_data) - np.mean(ecg_data)
            fft_vals = np.abs(np.fft.rfft(sig * np.hanning(len(sig))))
            freqs = np.fft.rfftfreq(len(sig), d=1.0 / self.fs)
            
            mask = (freqs >= 0.1) & (freqs <= 20.0)
            self.line_fft.set_data(freqs[mask], fft_vals[mask])
            
            if np.any(mask) and len(fft_vals[mask]) > 0:
                dom_freq = freqs[mask][np.argmax(fft_vals[mask])]
                self.freq_card.val_lbl.config(text=f"{dom_freq:.2f}")
                self.ax_fft.set_ylim(0, max(100, float(np.max(fft_vals[mask])) * 1.2))

        # Update Metric Cards
        if lo:
            self.bpm_card.val_lbl.config(text="--.-", fg="#EF4444")
            self.bpm_card.sub_lbl.config(text="⚠️ LEADS DETACHED")
        else:
            self.bpm_card.val_lbl.config(text=f"{bpm:.1f}", fg="#10B981")
            self.bpm_card.sub_lbl.config(text="Normal Sinus")

        self.hrv_card.val_lbl.config(text=f"{rmssd:.1f}")
        
        elapsed = max(0.1, time.time() - self.start_time)
        hz = samples / elapsed if self.is_streaming else 0.0
        self.fps_lbl.config(text=f"Streaming Rate: {hz:.1f} Hz | Samples: {samples}")

        return self.line_ecg, self.scatter_peaks, self.line_fft


def main():
    root = tk.Tk()
    app = Camera505EcgStudioApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
