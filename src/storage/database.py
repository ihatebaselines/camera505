"""
LIFE Platform - Local SQLite Database Manager
Provides persistent storage for sessions, raw telemetry chunks, 30s tokens,
night reports, anomaly events, and personalized baselines.
"""

import sqlite3
import json
import os
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from .models import (
    SessionRecord,
    TelemetryFrame,
    WindowToken30s,
    AnomalyEventRecord,
    UserBaselineRecord,
    NightReportSummary
)


class LifeDatabase:
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            data_dir = os.path.join(base_dir, "data")
            os.makedirs(data_dir, exist_ok=True)
            db_path = os.path.join(data_dir, "life_signals.db")
            
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # Enable Write-Ahead Logging (WAL) for high performance concurrent streaming
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Sessions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    mode TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active'
                )
            """)

            # 2. Telemetry Chunks table (Compressed batch storing raw frames)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS telemetry_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    start_ts_ms INTEGER NOT NULL,
                    end_ts_ms INTEGER NOT NULL,
                    sample_count INTEGER NOT NULL,
                    raw_data_json TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions (id)
                )
            """)

            # 3. 30-Second Window Tokens & Embeddings
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS window_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    window_idx INTEGER NOT NULL,
                    start_ts_ms INTEGER NOT NULL,
                    end_ts_ms INTEGER NOT NULL,
                    mean_hr REAL NOT NULL,
                    sdnn REAL NOT NULL,
                    rmssd REAL NOT NULL,
                    pnn50 REAL NOT NULL,
                    lf_hf_ratio REAL NOT NULL,
                    mean_resp_rate REAL NOT NULL,
                    stability_score REAL NOT NULL,
                    reconstruction_error REAL NOT NULL,
                    prediction_error REAL NOT NULL,
                    drift_score REAL NOT NULL,
                    anomaly_score REAL NOT NULL,
                    is_suspect_episode INTEGER NOT NULL DEFAULT 0,
                    suspect_reasons TEXT,
                    embedding_512 TEXT,
                    FOREIGN KEY (session_id) REFERENCES sessions (id)
                )
            """)

            # 4. Anomaly Events
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS anomaly_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    timestamp_ms INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    duration_sec REAL NOT NULL,
                    description TEXT NOT NULL,
                    metrics_snapshot TEXT,
                    FOREIGN KEY (session_id) REFERENCES sessions (id)
                )
            """)

            # 5. Night Summaries & Reports
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS night_summaries (
                    session_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    date_str TEXT NOT NULL,
                    total_duration_minutes REAL NOT NULL,
                    mean_heart_rate REAL NOT NULL,
                    min_heart_rate REAL NOT NULL,
                    max_heart_rate REAL NOT NULL,
                    mean_rmssd_hrv REAL NOT NULL,
                    mean_respiratory_rate REAL NOT NULL,
                    apnea_screening_index REAL NOT NULL,
                    total_snoring_minutes REAL NOT NULL,
                    total_cough_count INTEGER NOT NULL,
                    multimodal_risk_score REAL NOT NULL,
                    risk_level TEXT NOT NULL,
                    stability_grade TEXT NOT NULL,
                    clinical_disclaimer TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions (id)
                )
            """)

            # 6. User Personalized Baseline
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_baselines (
                    user_id TEXT PRIMARY KEY,
                    baseline_hr_mean REAL NOT NULL,
                    baseline_hr_std REAL NOT NULL,
                    baseline_rmssd_mean REAL NOT NULL,
                    baseline_rmssd_std REAL NOT NULL,
                    baseline_resp_mean REAL NOT NULL,
                    baseline_resp_std REAL NOT NULL,
                    night_count INTEGER NOT NULL DEFAULT 0,
                    recent_night_embeddings TEXT,
                    last_updated TEXT NOT NULL
                )
            """)

            # Create indexing for fast queries
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_tokens_session ON window_tokens (session_id, window_idx);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_session ON anomaly_events (session_id, timestamp_ms);")
            conn.commit()

    # Session Management
    def create_session(self, session: SessionRecord) -> SessionRecord:
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO sessions (id, user_id, start_time, end_time, mode, source_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (session.id, session.user_id, session.start_time, session.end_time, session.mode, session.source_type, session.status)
            )
            conn.commit()
        return session

    def close_session(self, session_id: str, end_time: Optional[str] = None):
        if end_time is None:
            end_time = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE sessions SET end_time = ?, status = 'completed' WHERE id = ?",
                (end_time, session_id)
            )
            conn.commit()

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
            if row:
                return dict(row)
            return None

    def list_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    # Telemetry Chunk Ingestion
    def save_telemetry_chunk(self, session_id: str, frames: List[TelemetryFrame]):
        if not frames:
            return
        start_ts = frames[0].timestamp_ms
        end_ts = frames[-1].timestamp_ms
        data_json = json.dumps([f.model_dump() for f in frames])
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO telemetry_chunks (session_id, start_ts_ms, end_ts_ms, sample_count, raw_data_json) VALUES (?, ?, ?, ?, ?)",
                (session_id, start_ts, end_ts, len(frames), data_json)
            )
            conn.commit()

    # 30-Second Token Recording
    def save_window_token(self, token: WindowToken30s):
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO window_tokens (
                    session_id, window_idx, start_ts_ms, end_ts_ms,
                    mean_hr, sdnn, rmssd, pnn50, lf_hf_ratio, mean_resp_rate,
                    stability_score, reconstruction_error, prediction_error,
                    drift_score, anomaly_score, is_suspect_episode, suspect_reasons,
                    embedding_512
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                token.session_id, token.window_idx, token.start_ts_ms, token.end_ts_ms,
                token.mean_hr, token.sdnn, token.rmssd, token.pnn50, token.lf_hf_ratio, token.mean_resp_rate,
                token.stability_score, token.reconstruction_error, token.prediction_error,
                token.drift_score, token.anomaly_score, 1 if token.is_suspect_episode else 0,
                json.dumps(token.suspect_reasons),
                json.dumps(token.embedding_512) if token.embedding_512 else None
            ))
            conn.commit()

    def get_window_tokens(self, session_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM window_tokens WHERE session_id = ? ORDER BY window_idx ASC", (session_id,)).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d['suspect_reasons'] = json.loads(d['suspect_reasons']) if d['suspect_reasons'] else []
                d['is_suspect_episode'] = bool(d['is_suspect_episode'])
                if d.get('embedding_512'):
                    d['embedding_512'] = json.loads(d['embedding_512'])
                result.append(d)
            return result

    # Anomaly Events
    def record_anomaly_event(self, event: AnomalyEventRecord):
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO anomaly_events (
                    session_id, timestamp_ms, event_type, severity, duration_sec, description, metrics_snapshot
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                event.session_id, event.timestamp_ms, event.event_type, event.severity,
                event.duration_sec, event.description, json.dumps(event.metrics_snapshot)
            ))
            conn.commit()

    def get_session_anomalies(self, session_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM anomaly_events WHERE session_id = ? ORDER BY timestamp_ms ASC", (session_id,)).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d['metrics_snapshot'] = json.loads(d['metrics_snapshot']) if d['metrics_snapshot'] else {}
                result.append(d)
            return result

    # User Baseline Management
    def get_user_baseline(self, user_id: str) -> UserBaselineRecord:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM user_baselines WHERE user_id = ?", (user_id,)).fetchone()
            if row:
                d = dict(row)
                embeddings = json.loads(d['recent_night_embeddings']) if d['recent_night_embeddings'] else []
                return UserBaselineRecord(
                    user_id=d['user_id'],
                    baseline_hr_mean=d['baseline_hr_mean'],
                    baseline_hr_std=d['baseline_hr_std'],
                    baseline_rmssd_mean=d['baseline_rmssd_mean'],
                    baseline_rmssd_std=d['baseline_rmssd_std'],
                    baseline_resp_mean=d['baseline_resp_mean'],
                    baseline_resp_std=d['baseline_resp_std'],
                    night_count=d['night_count'],
                    recent_night_embeddings=embeddings,
                    last_updated=d['last_updated']
                )
            # Create default baseline
            default_base = UserBaselineRecord(user_id=user_id)
            self.save_user_baseline(default_base)
            return default_base

    def save_user_baseline(self, baseline: UserBaselineRecord):
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO user_baselines (
                    user_id, baseline_hr_mean, baseline_hr_std,
                    baseline_rmssd_mean, baseline_rmssd_std,
                    baseline_resp_mean, baseline_resp_std,
                    night_count, recent_night_embeddings, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    baseline_hr_mean = excluded.baseline_hr_mean,
                    baseline_hr_std = excluded.baseline_hr_std,
                    baseline_rmssd_mean = excluded.baseline_rmssd_mean,
                    baseline_rmssd_std = excluded.baseline_rmssd_std,
                    baseline_resp_mean = excluded.baseline_resp_mean,
                    baseline_resp_std = excluded.baseline_resp_std,
                    night_count = excluded.night_count,
                    recent_night_embeddings = excluded.recent_night_embeddings,
                    last_updated = excluded.last_updated
            """, (
                baseline.user_id, baseline.baseline_hr_mean, baseline.baseline_hr_std,
                baseline.baseline_rmssd_mean, baseline.baseline_rmssd_std,
                baseline.baseline_resp_mean, baseline.baseline_resp_std,
                baseline.night_count, json.dumps(baseline.recent_night_embeddings),
                baseline.last_updated
            ))
            conn.commit()

    # Night Reports
    def save_night_summary(self, summary: NightReportSummary):
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO night_summaries (
                    session_id, user_id, date_str, total_duration_minutes,
                    mean_heart_rate, min_heart_rate, max_heart_rate,
                    mean_rmssd_hrv, mean_respiratory_rate, apnea_screening_index,
                    total_snoring_minutes, total_cough_count, multimodal_risk_score,
                    risk_level, stability_grade, clinical_disclaimer
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                summary.session_id, summary.user_id, summary.date_str, summary.total_duration_minutes,
                summary.mean_heart_rate, summary.min_heart_rate, summary.max_heart_rate,
                summary.mean_rmssd_hrv, summary.mean_respiratory_rate, summary.apnea_screening_index,
                summary.total_snoring_minutes, summary.total_cough_count, summary.multimodal_risk_score,
                summary.risk_level, summary.stability_grade, summary.clinical_disclaimer
            ))
            conn.commit()

    def get_night_summary(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM night_summaries WHERE session_id = ?", (session_id,)).fetchone()
            if row:
                return dict(row)
            return None
