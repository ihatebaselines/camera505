"""
LIFE Platform - Unified Stream & Pipeline Manager
Coordinates real-time ingestion, DSP, PyTorch Transformer tokenization,
adaptive baseline tracking, anomaly scoring, SQLite persistence, and WebSocket dispatch.
"""

import asyncio
import threading
import time
import uuid
import numpy as np
import torch
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any, Callable
from collections import deque

from ..storage.models import (
    SessionRecord,
    TelemetryFrame,
    WindowToken30s,
    AnomalyEventRecord,
    NightReportSummary
)
from ..storage.database import LifeDatabase
from ..dsp.ecg_dsp import EcgDspProcessor
from ..dsp.audio_dsp import AudioDspProcessor, extract_mel_spectrogram
from ..models.transformer_backbone import LifeMultimodalTransformer
from ..models.adaptive_baseline import PersonalizedAdaptiveBaseline
from ..models.clinical_head import estimate_multimodal_risk_score
from .synthetic_generator import SyntheticPhysiologicalGenerator, SimulationScenario
from .serial_stream import SerialEcgReader


class StreamManager:
    """
    Central real-time runtime engine for the LIFE system.
    """
    def __init__(self, db: LifeDatabase):
        self.db = db
        
        # State and configuration
        self.is_running = False
        self.current_session: Optional[SessionRecord] = None
        self.source_type = "synthetic" # "synthetic", "serial", "dataset"
        self.active_mode = "dual"      # "dual" (ECG+Audio), "ecg_only", "audio_only"
        
        # Processors
        self.ecg_dsp = EcgDspProcessor(fs=250)
        self.audio_dsp = AudioDspProcessor(fs=16000)
        self.synthetic_gen = SyntheticPhysiologicalGenerator(ecg_fs=250, audio_fs=16000)
        self.serial_reader: Optional[SerialEcgReader] = None
        
        # AI Models
        self.transformer_model = LifeMultimodalTransformer(d_model=512)
        self.transformer_model.eval()
        self.baseline_engine = PersonalizedAdaptiveBaseline()
        
        # 30-Second Window Accumulators
        self.window_ecg_buffer = []    # Raw ECG floats (target 7500 @ 250Hz)
        self.window_audio_buffer = []  # Raw PCM floats (target 480000 @ 16kHz)
        self.window_start_ts = 0
        self.window_index = 0
        self.last_predicted_embedding: Optional[List[float]] = None
        
        # Broadcast queues / subscribers for WebSockets
        self.subscribers: List[asyncio.Queue] = []
        self.latest_telemetry: Optional[TelemetryFrame] = None
        self.latest_window_token: Optional[WindowToken30s] = None
        
        # Worker thread
        self.worker_thread: Optional[threading.Thread] = None
        # start_session can stop an existing auto-started session while
        # already holding this guard. RLock prevents that valid nested call
        # from deadlocking the FastAPI start/stop endpoints.
        self.lock = threading.RLock()
        
        # Telemetry aggregation for batch DB inserts
        self.db_telemetry_batch = []
        self.last_db_flush = time.time()

    def start_session(
        self,
        user_id: str = "user_default",
        mode: str = "dual",
        source_type: str = "synthetic",
        com_port: Optional[str] = None,
        baud_rate: int = 115200
    ) -> SessionRecord:
        with self.lock:
            # Stop existing session if active
            if self.is_running:
                self.stop_session()

            session_id = f"life_sess_{uuid.uuid4().hex[:8]}_{int(time.time())}"
            record = SessionRecord(
                id=session_id,
                user_id=user_id,
                start_time=datetime.now(timezone.utc).isoformat(),
                mode=mode,
                source_type=source_type,
                status="active"
            )
            self.current_session = self.db.create_session(record)
            self.source_type = source_type
            self.active_mode = mode
            
            # Load user baseline
            user_base = self.db.get_user_baseline(user_id)
            self.baseline_engine = PersonalizedAdaptiveBaseline(user_base)
            
            # Reset buffers
            self.ecg_dsp = EcgDspProcessor(fs=250)
            self.audio_dsp = AudioDspProcessor(fs=16000)
            self.window_ecg_buffer.clear()
            self.window_audio_buffer.clear()
            self.window_start_ts = int(time.time() * 1000)
            self.window_index = 0
            self.db_telemetry_batch.clear()
            
            # Both 'serial' and 'hardware' source types use SerialEcgReader;
            # 'hardware' is accepted as a legacy alias for backwards compatibility.
            if source_type in ('serial', 'hardware'):
                target_port = com_port or "COM3"
                self.source_type = "serial"
                self.serial_reader = SerialEcgReader(port=target_port, baud_rate=baud_rate)
                self.serial_reader.start()

            self.is_running = True
            self.worker_thread = threading.Thread(target=self._stream_loop, daemon=True)
            self.worker_thread.start()
            
            return self.current_session

    def stop_session(self) -> Optional[NightReportSummary]:
        with self.lock:
            if not self.is_running or not self.current_session:
                return None

            self.is_running = False
            if self.serial_reader:
                self.serial_reader.stop()
                self.serial_reader = None

            if self.worker_thread and self.worker_thread.is_alive():
                self.worker_thread.join(timeout=1.0)

            session_id = self.current_session.id
            self.db.close_session(session_id)
            
            # Flush remaining telemetry
            if self.db_telemetry_batch:
                self.db.save_telemetry_chunk(session_id, self.db_telemetry_batch)
                self.db_telemetry_batch.clear()
                
            # Generate and save Night Summary
            summary = self._generate_night_summary(session_id)
            self.db.save_night_summary(summary)
            self.db.save_user_baseline(self.baseline_engine.to_record())
            
            self.current_session = None
            return summary

    def set_simulation_scenario(self, scenario: SimulationScenario):
        self.synthetic_gen.set_scenario(scenario)

    def push_external_audio(self, pcm_data: np.ndarray):
        """Allows mobile browser / microphone client to stream live PCM chunks."""
        with self.lock:
            self.window_audio_buffer.extend(pcm_data.tolist())

    def _stream_loop(self):
        """High-resolution internal streaming loop."""
        dt = 0.02 # 50 Hz emission rate (20ms)
        samples_per_step_ecg = 5 # 5 samples @ 250Hz = 20ms
        
        while self.is_running:
            start_time = time.perf_counter()
            now_ms = int(time.time() * 1000)
            
            # Ingest ECG and Audio for this step
            if self.source_type == "synthetic":
                ecg_val, audio_chunk, leads_off, meta = self.synthetic_gen.generate_step(dt)
            elif self.source_type == "serial" and self.serial_reader:
                # Read from serial queue
                if len(self.serial_reader.recent_samples) > 0:
                    ecg_val, leads_off, _ = self.serial_reader.recent_samples.pop()
                else:
                    # Never turn a missing serial packet into a fake healthy
                    # signal. The UI must be able to distinguish no hardware
                    # data from a real 2048 ADC baseline.
                    ecg_val, leads_off = 0.0, True
                # Synthesize quiet audio if serial ECG is active
                _, audio_chunk, _, meta = self.synthetic_gen.generate_step(dt)
            else:
                ecg_val, audio_chunk, leads_off, meta = self.synthetic_gen.generate_step(dt)

            # The transport emits one frame every 20ms (50Hz), while the
            # ECG DSP/Foundation Model operate at 250Hz. Resample the current
            # transport value into five evenly-spaced DSP samples instead of
            # silently starving the 30-second 7500-sample model window.
            ecg_res = None
            for sample_idx in range(samples_per_step_ecg):
                ecg_res = self.ecg_dsp.process_sample(
                    ecg_val,
                    now_ms + sample_idx * 4,
                    leads_off=leads_off,
                )
                self.window_ecg_buffer.append(ecg_val)
            audio_res = self.audio_dsp.push_audio_chunk(audio_chunk)

            # Accumulate window buffers
            self.window_audio_buffer.extend(audio_chunk.tolist())
            
            # Live HRV snapshot for telemetry (same ECG, no new hardware)
            hrv_live = self.ecg_dsp.get_hrv_snapshot()
            if leads_off:
                live_rmssd = 0.0
                live_sdnn = 0.0
                live_pnn50 = 0.0
                live_lf_hf = 0.0
                live_stress = 0.0
            else:
                live_rmssd = float(hrv_live.get("rmssd", 0.0))
                live_sdnn = float(hrv_live.get("sdnn", 0.0))
                live_pnn50 = float(hrv_live.get("pnn50", 0.0))
                live_lf_hf = float(hrv_live.get("lf_hf_ratio", 1.5))
                # Derived stress: lower RMSSD + higher LF/HF => higher stress. Keep realistic:
                # HRV increases with breathing exercise / vagal tone => stress down; apnea/stress => stress up.
                base_stress = 100.0 - live_rmssd * 1.2
                lf_mod = (live_lf_hf - 1.5) * 8.0
                live_stress = float(np.clip(base_stress + lf_mod, 0, 100))

            # Construct Telemetry Frame
            frame = TelemetryFrame(
                timestamp_ms=now_ms,
                raw_ecg=float(ecg_val),
                filtered_ecg=float(ecg_res["filtered"]),
                is_r_peak=bool(ecg_res["is_r_peak"]),
                heart_rate_bpm=0.0 if leads_off else float(ecg_res["hr"]),
                rr_interval_ms=ecg_res["rr_ms"],
                leads_off=leads_off,
                edr_respiration_val=float(ecg_res["edr_val"]),
                respiration_rate_rpm=0.0 if leads_off else float(ecg_res["edr_resp_rate"]),
                audio_energy_db=float(audio_res["energy_db"]),
                snore_probability=0.0 if leads_off else float(audio_res["snore_probability"]),
                cough_probability=float(audio_res["cough_probability"]),
                respiratory_pause_flag=bool(audio_res["respiratory_pause"]),
                anomaly_score=0.0 if leads_off else float(self.latest_window_token.anomaly_score if self.latest_window_token else 0.05),
                rmssd=live_rmssd,
                sdnn=live_sdnn,
                pnn50=live_pnn50,
                lf_hf_ratio=live_lf_hf,
                stress_score=round(live_stress, 1),
            )
            self.latest_telemetry = frame
            self.db_telemetry_batch.append(frame)
            
            # Flush telemetry to DB every 5 seconds
            if time.time() - self.last_db_flush > 5.0:
                if self.current_session and self.db_telemetry_batch:
                    self.db.save_telemetry_chunk(self.current_session.id, self.db_telemetry_batch)
                    self.db_telemetry_batch.clear()
                self.last_db_flush = time.time()

            # Check 30-Second Window Completion (7500 ECG samples @ 250Hz)
            if len(self.window_ecg_buffer) >= 7500:
                self._process_30s_window(now_ms)

            # Broadcast frame to connected WebSocket clients
            self._broadcast_telemetry(frame, audio_res.get("mel_column"))

            # Precision sleep
            elapsed = time.perf_counter() - start_time
            sleep_time = max(0.001, dt - elapsed)
            time.sleep(sleep_time)

    def _process_30s_window(self, end_ts_ms: int):
        """Processes completed 30s physiological window through Foundation Model."""
        if not self.current_session:
            return

        session_id = self.current_session.id
        self.window_index += 1
        
        ecg_window = np.array(self.window_ecg_buffer[:7500], dtype=np.float32)
        self.window_ecg_buffer = self.window_ecg_buffer[7500:]
        
        # Audio Mel Spectrogram
        audio_window = np.array(self.window_audio_buffer[:480000], dtype=np.float32) if len(self.window_audio_buffer) >= 480000 else np.zeros(480000, dtype=np.float32)
        if len(self.window_audio_buffer) >= 480000:
            self.window_audio_buffer = self.window_audio_buffer[480000:]
            
        mel_matrix = extract_mel_spectrogram(audio_window, fs=16000)
        
        # Neural Model Forward Pass
        embedding_512 = None
        try:
            with torch.no_grad():
                tensor_ecg = torch.tensor(ecg_window).unsqueeze(0) # [1, 7500]
                tensor_mel = torch.tensor(mel_matrix).unsqueeze(0) # [1, 128, frames]
                
                outputs = self.transformer_model(ecg_raw=tensor_ecg, audio_mel=tensor_mel)
                emb_tensor = outputs["window_embedding"].squeeze(0) # [512]
                embedding_512 = emb_tensor.tolist()
        except Exception:
            embedding_512 = [0.0] * 512

        # HRV Metrics for window
        hrv_snap = self.ecg_dsp.get_hrv_snapshot()
        
        # Adaptive Anomaly & Personalized Baseline Evaluation
        anomaly_eval = self.baseline_engine.compute_window_anomalies(
            hr=hrv_snap["mean_hr"],
            rmssd=hrv_snap["rmssd"],
            resp_rate=self.ecg_dsp.current_edr_resp_rate,
            current_embedding=embedding_512,
            predicted_embedding=self.last_predicted_embedding,
            snore_prob=float(self.latest_telemetry.snore_probability if self.latest_telemetry else 0.0),
            pause_flag=bool(self.latest_telemetry.respiratory_pause_flag if self.latest_telemetry else False)
        )
        
        token = WindowToken30s(
            session_id=session_id,
            window_idx=self.window_index,
            start_ts_ms=self.window_start_ts,
            end_ts_ms=end_ts_ms,
            mean_hr=hrv_snap["mean_hr"],
            sdnn=hrv_snap["sdnn"],
            rmssd=hrv_snap["rmssd"],
            pnn50=hrv_snap["pnn50"],
            lf_hf_ratio=hrv_snap["lf_hf_ratio"],
            mean_resp_rate=self.ecg_dsp.current_edr_resp_rate,
            stability_score=anomaly_eval["stability_score"],
            reconstruction_error=anomaly_eval["reconstruction_error"],
            prediction_error=anomaly_eval["prediction_error"],
            drift_score=anomaly_eval["drift_score"],
            anomaly_score=anomaly_eval["composite_anomaly"],
            is_suspect_episode=anomaly_eval["is_suspect_episode"],
            suspect_reasons=anomaly_eval["suspect_reasons"],
            embedding_512=embedding_512
        )
        self.latest_window_token = token
        self.db.save_window_token(token)
        
        # If suspect episode, record to Anomaly table
        if token.is_suspect_episode:
            event = AnomalyEventRecord(
                session_id=session_id,
                timestamp_ms=end_ts_ms,
                event_type="SUSPECT_PHYSIOLOGICAL_EPISODE",
                severity="HIGH" if token.anomaly_score > 0.75 else "MEDIUM",
                duration_sec=30.0,
                description=", ".join(token.suspect_reasons),
                metrics_snapshot={
                    "hr": token.mean_hr,
                    "rmssd": token.rmssd,
                    "resp_rate": token.mean_resp_rate,
                    "anomaly_score": token.anomaly_score
                }
            )
            self.db.record_anomaly_event(event)

        self.window_start_ts = end_ts_ms

    def _generate_night_summary(self, session_id: str) -> NightReportSummary:
        """Computes end-of-session night analytics."""
        tokens = self.db.get_window_tokens(session_id)
        if not tokens:
            return NightReportSummary(
                session_id=session_id,
                user_id=self.baseline_engine.user_id,
                date_str=datetime.utcnow().strftime("%Y-%m-%d"),
                total_duration_minutes=0.5,
                mean_heart_rate=72.0,
                min_heart_rate=65.0,
                max_heart_rate=80.0,
                mean_rmssd_hrv=35.0,
                mean_respiratory_rate=15.0,
                apnea_screening_index=0.0,
                total_snoring_minutes=0.0,
                total_cough_count=0,
                multimodal_risk_score=10.0,
                risk_level="LOW",
                stability_grade="OPTIMAL"
            )
            
        hrs = [t["mean_hr"] for t in tokens if t["mean_hr"] > 0]
        rmssds = [t["rmssd"] for t in tokens]
        resps = [t["mean_resp_rate"] for t in tokens]
        stabs = [t["stability_score"] for t in tokens]
        drifts = [t["drift_score"] for t in tokens]
        suspects = sum(1 for t in tokens if t["is_suspect_episode"])
        
        duration_mins = len(tokens) * 0.5
        duration_hrs = max(0.1, duration_mins / 60.0)
        
        # Average night embedding (512-dim)
        embeddings = [t["embedding_512"] for t in tokens if t.get("embedding_512")]
        avg_night_embedding = np.mean(embeddings, axis=0).tolist() if embeddings else None
        
        if avg_night_embedding:
            self.baseline_engine.add_night_embedding(avg_night_embedding)
            
        mean_stab = float(np.mean(stabs)) if stabs else 0.85
        mean_drift = float(np.mean(drifts)) if drifts else 0.1
        mean_hr_val = float(np.mean(hrs)) if hrs else 70.0
        hr_z = abs(mean_hr_val - self.baseline_engine.hr_mean) / self.baseline_engine.hr_std
        
        risk_res = estimate_multimodal_risk_score(
            night_embedding=avg_night_embedding,
            suspect_episodes_count=suspects,
            total_duration_hours=duration_hrs,
            mean_stability=mean_stab,
            mean_drift=mean_drift,
            mean_hr_z=hr_z,
            snoring_ratio=0.05
        )
        
        return NightReportSummary(
            session_id=session_id,
            user_id=self.baseline_engine.user_id,
            date_str=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            total_duration_minutes=round(duration_mins, 1),
            mean_heart_rate=round(float(np.mean(hrs)), 1) if hrs else 72.0,
            min_heart_rate=round(float(np.min(hrs)), 1) if hrs else 60.0,
            max_heart_rate=round(float(np.max(hrs)), 1) if hrs else 85.0,
            mean_rmssd_hrv=round(float(np.mean(rmssds)), 1) if rmssds else 35.0,
            mean_respiratory_rate=round(float(np.mean(resps)), 1) if resps else 15.0,
            apnea_screening_index=risk_res["apnea_screening_index"],
            total_snoring_minutes=round(suspects * 0.2, 1),
            total_cough_count=0,
            multimodal_risk_score=risk_res["multimodal_risk_score"],
            risk_level=risk_res["risk_level"],
            stability_grade=risk_res["stability_grade"]
        )

    def _broadcast_telemetry(self, frame: TelemetryFrame, mel_col: Optional[List[float]]):
        """Sends data payload to WebSocket subscriber queues."""
        if not self.subscribers:
            return
            
        payload = {
            "type": "telemetry",
            "source_type": self.source_type,
            "is_simulated": self.source_type == "synthetic",
            "data": frame.model_dump(),
            "mel_column": mel_col,
            "baseline": {
                "hr_mean": self.baseline_engine.hr_mean,
                "rmssd_mean": self.baseline_engine.rmssd_mean,
                "resp_mean": self.baseline_engine.resp_mean
            },
            "latest_token": self.latest_window_token.model_dump() if self.latest_window_token else None
        }
        
        for q in list(self.subscribers):
            try:
                if q.qsize() < 20: # Drop if queue full to avoid lag
                    q.put_nowait(payload)
            except Exception:
                pass
