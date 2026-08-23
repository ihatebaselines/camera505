"""
LIFE Platform - Pydantic Data Models and Schemas
Defines core data structures for telemetry, embeddings, anomalies, and baseline tracking.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone


class SessionCreate(BaseModel):
    user_id: str = Field(default="user_default")
    mode: str = Field(default="dual", description="'dual' (ECG+Audio), 'ecg_only', 'audio_only'")
    source_type: str = Field(default="synthetic", description="'serial', 'ble', 'synthetic', 'dataset'")
    com_port: Optional[str] = None
    baud_rate: int = 115200


class SessionRecord(BaseModel):
    id: str
    user_id: str
    start_time: str
    end_time: Optional[str] = None
    mode: str
    source_type: str
    status: str = "active"  # active, completed, stopped


class TelemetryFrame(BaseModel):
    timestamp_ms: int
    raw_ecg: float
    filtered_ecg: float
    is_r_peak: bool = False
    heart_rate_bpm: float = 0.0
    rr_interval_ms: Optional[float] = None
    leads_off: bool = False
    edr_respiration_val: float = 0.0
    respiration_rate_rpm: float = 0.0
    audio_energy_db: float = -60.0
    snore_probability: float = 0.0
    cough_probability: float = 0.0
    respiratory_pause_flag: bool = False
    anomaly_score: float = 0.0
    # Complete HRV snapshot (same ECG source, no new hardware)
    rmssd: float = 0.0
    sdnn: float = 0.0
    pnn50: float = 0.0
    lf_hf_ratio: float = 0.0
    stress_score: float = 0.0


class WindowToken30s(BaseModel):
    id: Optional[int] = None
    session_id: str
    window_idx: int
    start_ts_ms: int
    end_ts_ms: int
    mean_hr: float
    sdnn: float
    rmssd: float
    pnn50: float
    lf_hf_ratio: float
    mean_resp_rate: float
    stability_score: float
    reconstruction_error: float
    prediction_error: float
    drift_score: float
    anomaly_score: float
    is_suspect_episode: bool = False
    suspect_reasons: List[str] = []
    embedding_512: Optional[List[float]] = None


class AnomalyEventRecord(BaseModel):
    id: Optional[int] = None
    session_id: str
    timestamp_ms: int
    event_type: str  # 'APNEA_SUSPECT', 'TACHYCARDIA', 'BRADYCARDIA', 'SNORE_BURST', 'COUGH_BURST', 'LEADS_OFF'
    severity: str    # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    duration_sec: float
    description: str
    metrics_snapshot: Dict[str, Any] = {}


class UserBaselineRecord(BaseModel):
    user_id: str
    baseline_hr_mean: float = 72.0
    baseline_hr_std: float = 8.0
    baseline_rmssd_mean: float = 42.0
    baseline_rmssd_std: float = 10.0
    baseline_resp_mean: float = 15.0
    baseline_resp_std: float = 2.0
    night_count: int = 0
    recent_night_embeddings: List[List[float]] = []
    last_updated: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class NightReportSummary(BaseModel):
    session_id: str
    user_id: str
    date_str: str
    total_duration_minutes: float
    mean_heart_rate: float
    min_heart_rate: float
    max_heart_rate: float
    mean_rmssd_hrv: float
    mean_respiratory_rate: float
    apnea_screening_index: float
    total_snoring_minutes: float
    total_cough_count: int
    multimodal_risk_score: float  # 0 to 100
    risk_level: str               # 'LOW', 'ELEVATED', 'HIGH'
    stability_grade: str          # 'OPTIMAL', 'MODERATE', 'IRREGULAR'
    clinical_disclaimer: str = (
        "Notice: LIFE is a personal physiological screening and signal-monitoring platform. "
        "Calculated metrics are exploratory and not intended as a medical diagnosis. "
        "Consult a healthcare professional for clinical evaluation."
    )
