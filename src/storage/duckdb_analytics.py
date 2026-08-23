"""
LIFE Platform - DuckDB High-Speed Analytics Layer (Python Interface)
Wraps the DuckDB columnar database for:
- Ultra-fast ECG time-series ingestion (bulk insert via Apache Arrow)
- Vectorized HRV aggregation queries
- Window token analytics with rolling statistics  
- Parquet export for training pipelines
- 14-dataset registry management
"""

import os
import time
import numpy as np
import json
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, timezone

import duckdb


# Dataset Registry: All 14 validated datasets
LIFE_DATASET_REGISTRY = [
    {
        "dataset_id": "apnea_ecg",
        "name": "Apnea-ECG Database",
        "source": "PhysioNet",
        "num_subjects": 70,
        "total_hours": 9.3,
        "modalities": "Single-Lead ECG, Apnea/Normal Labels",
        "has_apnea_labels": True,
        "access_url": "https://physionet.org/content/apnea-ecg/1.0.0/",
        "physionet_slug": "apnea-ecg/1.0.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "mitbih_poly",
        "name": "MIT-BIH Polysomnographic Database",
        "source": "PhysioNet",
        "num_subjects": 18,
        "total_hours": 2.4,
        "modalities": "ECG, EEG, EOG, EMG, SpO2, Sleep Stages",
        "has_apnea_labels": True,
        "access_url": "https://physionet.org/content/slpdb/1.0.0/",
        "physionet_slug": "slpdb/1.0.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "dreamt",
        "name": "DREAMT: Wearable PSG Dataset (2026)",
        "source": "PhysioNet",
        "num_subjects": 100,
        "total_hours": 800.0,
        "modalities": "Wearable ECG, PPG, Actigraphy, PSG reference, Apnea annotations",
        "has_apnea_labels": True,
        "access_url": "https://physionet.org/content/dreamt/1.0.0/",
        "physionet_slug": "dreamt/1.0.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "cap_sleep",
        "name": "CAP Sleep Database",
        "source": "PhysioNet",
        "num_subjects": 108,
        "total_hours": 450.0,
        "modalities": "EEG, ECG, EMG, Respiration, SpO2, Sleep stages",
        "has_apnea_labels": True,
        "access_url": "https://physionet.org/content/capslpdb/1.0.0/",
        "physionet_slug": "capslpdb/1.0.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "bidmc_ppg",
        "name": "BIDMC PPG and Respiration Dataset",
        "source": "PhysioNet",
        "num_subjects": 53,
        "total_hours": 7.1,
        "modalities": "ECG (Lead II), PPG, Reference Respiration Waveform",
        "has_apnea_labels": False,
        "access_url": "https://physionet.org/content/bidmc/1.0.0/",
        "physionet_slug": "bidmc/1.0.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "fantasia",
        "name": "Fantasia Database (Young & Elderly HRV)",
        "source": "PhysioNet",
        "num_subjects": 40,
        "total_hours": 20.0,
        "modalities": "ECG, Continuous Respiration (young vs elderly)",
        "has_apnea_labels": False,
        "access_url": "https://physionet.org/content/fantasia/1.0.0/",
        "physionet_slug": "fantasia/1.0.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "psg_audio_sciencedb",
        "name": "PSG-Audio Dataset",
        "source": "ScienceDB (doi:10.11922/sciencedb.00345)",
        "num_subjects": 212,
        "total_hours": 1800.0,
        "modalities": "ECG, Tracheal Audio, Ambient Audio 16kHz, Full PSG, Apnea/Snore labels",
        "has_apnea_labels": True,
        "access_url": "https://www.sciencedb.cn/en/detail?dataSetId=797746401676656640",
        "physionet_slug": None,
        "wfdb_accessible": False
    },
    {
        "dataset_id": "ucddb",
        "name": "UCD Sleep Apnea Database",
        "source": "PhysioNet",
        "num_subjects": 25,
        "total_hours": 200.0,
        "modalities": "ECG, SpO2, Nasal Airflow, Chest Effort, EEG, Apnea annotations",
        "has_apnea_labels": True,
        "access_url": "https://physionet.org/content/ucddb/1.0.0/",
        "physionet_slug": "ucddb/1.0.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "nstdb",
        "name": "MIT-BIH Noise Stress Test Database",
        "source": "PhysioNet",
        "num_subjects": 12,
        "total_hours": 5.0,
        "modalities": "ECG with electrode motion, BW, MA artifacts",
        "has_apnea_labels": False,
        "access_url": "https://physionet.org/content/nstdb/1.0.0/",
        "physionet_slug": "nstdb/1.0.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "challenge2018",
        "name": "PhysioNet/CinC Challenge 2018: Sleep Staging",
        "source": "PhysioNet",
        "num_subjects": 1985,
        "total_hours": 15000.0,
        "modalities": "PSG (ECG, EEG, EMG, EOG), Sleep staging 0-5 labels",
        "has_apnea_labels": True,
        "access_url": "https://physionet.org/content/challenge-2018/1.0.0/",
        "physionet_slug": "challenge-2018/1.0.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "icentia11k",
        "name": "Icentia11k: 11,000-Patient Long-term ECG",
        "source": "PhysioNet",
        "num_subjects": 11000,
        "total_hours": 131000.0,
        "modalities": "Single-Lead ECG 14-days continuous, Arrhythmia annotations",
        "has_apnea_labels": False,
        "access_url": "https://physionet.org/content/icentia11k/1.0/",
        "physionet_slug": "icentia11k/1.0",
        "wfdb_accessible": True
    },
    {
        "dataset_id": "mesa_sleep",
        "name": "MESA Sleep Study",
        "source": "NSRR / sleepdata.org",
        "num_subjects": 2056,
        "total_hours": 12000.0,
        "modalities": "PSG, ECG, EEG, Actigraphy, Questionnaires, Apnea annotations",
        "has_apnea_labels": True,
        "access_url": "https://sleepdata.org/datasets/mesa",
        "physionet_slug": None,
        "wfdb_accessible": False
    },
    {
        "dataset_id": "shhs",
        "name": "Sleep Heart Health Study (SHHS)",
        "source": "NSRR / sleepdata.org",
        "num_subjects": 5804,
        "total_hours": 45000.0,
        "modalities": "Full PSG, ECG, Cardiovascular follow-up, Sleep annotations",
        "has_apnea_labels": True,
        "access_url": "https://sleepdata.org/datasets/shhs",
        "physionet_slug": None,
        "wfdb_accessible": False
    },
    {
        "dataset_id": "mit_ecg_compression",
        "name": "MIT-BIH Arrhythmia Database",
        "source": "PhysioNet",
        "num_subjects": 48,
        "total_hours": 24.0,
        "modalities": "Dual-Lead ECG, Arrhythmia beat annotations (19 classes)",
        "has_apnea_labels": False,
        "access_url": "https://physionet.org/content/mitdb/1.0.0/",
        "physionet_slug": "mitdb/1.0.0",
        "wfdb_accessible": True
    }
]


class LifeDuckDB:
    """Python-side DuckDB analytics layer for LIFE Platform."""

    def __init__(self, db_path: Optional[str] = None):
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_dir = os.path.join(base, "data")
        os.makedirs(data_dir, exist_ok=True)
        
        if db_path is None:
            db_path = os.path.join(data_dir, "life_analytics.duckdb")
        
        self.db_path = db_path
        self.con = duckdb.connect(db_path)
        self._init_schema()
        self._register_all_datasets()

    def _init_schema(self):
        self.con.execute("""
            CREATE TABLE IF NOT EXISTS ecg_telemetry (
                session_id     VARCHAR NOT NULL,
                timestamp_ms   UBIGINT NOT NULL,
                raw_ecg        FLOAT,
                filtered_ecg   FLOAT,
                is_r_peak      BOOLEAN DEFAULT false,
                hr_bpm         FLOAT,
                leads_off      BOOLEAN DEFAULT false,
                edr_val        FLOAT DEFAULT 0.0,
                edr_resp_rpm   FLOAT DEFAULT 0.0
            )
        """)
        
        self.con.execute("""
            CREATE TABLE IF NOT EXISTS window_tokens_fast (
                session_id           VARCHAR NOT NULL,
                window_idx           INTEGER NOT NULL,
                start_ts_ms          UBIGINT NOT NULL,
                end_ts_ms            UBIGINT NOT NULL,
                mean_hr              FLOAT,
                sdnn                 FLOAT,
                rmssd                FLOAT,
                pnn50                FLOAT,
                lf_hf_ratio          FLOAT,
                mean_resp_rate       FLOAT,
                stability_score      FLOAT,
                reconstruction_error FLOAT,
                prediction_error     FLOAT,
                drift_score          FLOAT,
                anomaly_score        FLOAT,
                is_suspect_episode   BOOLEAN DEFAULT false,
                suspect_reasons      VARCHAR DEFAULT '[]',
                embedding_blob       BLOB
            )
        """)
        
        self.con.execute("""
            CREATE TABLE IF NOT EXISTS acoustic_events_fast (
                session_id     VARCHAR NOT NULL,
                timestamp_ms   UBIGINT NOT NULL,
                event_type     VARCHAR NOT NULL,
                duration_sec   FLOAT,
                amplitude_db   FLOAT,
                snore_prob     FLOAT,
                cough_prob     FLOAT
            )
        """)

        self.con.execute("""
            CREATE TABLE IF NOT EXISTS life_datasets (
                dataset_id       VARCHAR PRIMARY KEY,
                name             VARCHAR,
                source           VARCHAR,
                num_subjects     INTEGER,
                total_hours      FLOAT,
                modalities       VARCHAR,
                has_apnea_labels BOOLEAN,
                access_url       VARCHAR,
                wfdb_accessible  BOOLEAN,
                registered_at    TIMESTAMP DEFAULT now()
            )
        """)

    def _register_all_datasets(self):
        for ds in LIFE_DATASET_REGISTRY:
            self.con.execute("""
                INSERT OR REPLACE INTO life_datasets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now())
            """, [
                ds["dataset_id"], ds["name"], ds["source"], ds["num_subjects"],
                ds["total_hours"], ds["modalities"], ds["has_apnea_labels"],
                ds["access_url"], ds.get("wfdb_accessible", False)
            ])
        self.con.commit()

    def bulk_insert_ecg(
        self,
        session_id: str,
        timestamps_ms: List[int],
        raw_ecg: List[float],
        filtered_ecg: List[float],
        r_peaks: List[bool],
        hr_bpm: List[float],
        leads_off: Optional[List[bool]] = None
    ):
        """Bulk insert ECG using vectorized Pandas->Arrow->DuckDB (>1M rows/sec)."""
        import pandas as pd
        n = len(timestamps_ms)
        if leads_off is None:
            leads_off = [False] * n
        
        df = pd.DataFrame({
            "session_id":   [session_id] * n,
            "timestamp_ms": np.array(timestamps_ms, dtype=np.uint64),
            "raw_ecg":      np.array(raw_ecg, dtype=np.float32),
            "filtered_ecg": np.array(filtered_ecg, dtype=np.float32),
            "is_r_peak":    np.array(r_peaks, dtype=bool),
            "hr_bpm":       np.array(hr_bpm, dtype=np.float32),
            "leads_off":    np.array(leads_off, dtype=bool),
        })
        t0 = time.time()
        # Register the DataFrame as a virtual table and INSERT INTO in one shot
        self.con.register("_ecg_insert_df", df)
        self.con.execute("""
            INSERT INTO ecg_telemetry
            (session_id, timestamp_ms, raw_ecg, filtered_ecg, is_r_peak, hr_bpm, leads_off)
            SELECT session_id, timestamp_ms, raw_ecg, filtered_ecg, is_r_peak, hr_bpm, leads_off
            FROM _ecg_insert_df
        """)
        self.con.unregister("_ecg_insert_df")
        self.con.commit()
        elapsed = time.time() - t0
        throughput = n / max(elapsed, 1e-6)
        print(f"[DuckDB] Inserted {n} ECG samples in {elapsed*1000:.1f}ms ({throughput:.0f} samples/sec)")

    def get_session_analytics(self, session_id: str) -> Dict[str, Any]:
        """Fast vectorized HRV analytics using DuckDB columnar aggregation."""
        result = self.con.execute("""
            SELECT
                COUNT(*) as total_samples,
                AVG(hr_bpm) as mean_hr,
                MIN(hr_bpm) as min_hr,
                MAX(hr_bpm) as max_hr,
                STDDEV(hr_bpm) as stddev_hr,
                COUNT_IF(is_r_peak) as total_r_peaks,
                COUNT_IF(leads_off) as leads_off_samples,
                MIN(timestamp_ms) as start_ts,
                MAX(timestamp_ms) as end_ts
            FROM ecg_telemetry
            WHERE session_id = ?
        """, [session_id]).fetchone()

        if result is None:
            return {}

        cols = ["total_samples", "mean_hr", "min_hr", "max_hr", "stddev_hr",
                "total_r_peaks", "leads_off_samples", "start_ts", "end_ts"]
        return {k: v for k, v in zip(cols, result)}

    def get_anomaly_trend(self, session_id: str) -> List[Dict[str, Any]]:
        """Rolling anomaly score trend over 30s windows."""
        rows = self.con.execute("""
            SELECT
                window_idx, mean_hr, rmssd, mean_resp_rate,
                anomaly_score, is_suspect_episode,
                AVG(anomaly_score) OVER (
                    ORDER BY window_idx
                    ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
                ) as rolling_anomaly_5win
            FROM window_tokens_fast
            WHERE session_id = ?
            ORDER BY window_idx
        """, [session_id]).fetchall()
        
        cols = ["window_idx", "mean_hr", "rmssd", "mean_resp_rate",
                "anomaly_score", "is_suspect_episode", "rolling_anomaly_5win"]
        return [dict(zip(cols, r)) for r in rows]

    def export_parquet(self, session_id: str, output_path: str):
        """Export session ECG data to Parquet for offline training."""
        self.con.execute(f"""
            COPY (SELECT * FROM ecg_telemetry WHERE session_id = '{session_id}')
            TO '{output_path}' (FORMAT PARQUET, COMPRESSION 'snappy')
        """)
        print(f"[DuckDB] Exported '{session_id}' to Parquet: {output_path}")

    def get_dataset_registry(self) -> List[Dict[str, Any]]:
        """Returns all registered datasets sorted by total coverage hours."""
        rows = self.con.execute("""
            SELECT dataset_id, name, source, num_subjects, total_hours, modalities,
                   has_apnea_labels, wfdb_accessible
            FROM life_datasets
            ORDER BY total_hours DESC
        """).fetchall()
        cols = ["dataset_id", "name", "source", "num_subjects", "total_hours",
                "modalities", "has_apnea_labels", "wfdb_accessible"]
        return [dict(zip(cols, r)) for r in rows]

    def get_dataset_stats(self) -> Dict[str, Any]:
        """Aggregate statistics across the full dataset registry."""
        row = self.con.execute("""
            SELECT
                COUNT(*) as total_datasets,
                SUM(num_subjects) as total_subjects,
                SUM(total_hours) as total_hours,
                COUNT_IF(has_apnea_labels) as datasets_with_apnea,
                COUNT_IF(wfdb_accessible) as freely_accessible
            FROM life_datasets
        """).fetchone()
        return {
            "total_datasets": row[0],
            "total_subjects": row[1],
            "total_hours": round(row[2] or 0.0, 1),
            "datasets_with_apnea_labels": row[3],
            "freely_accessible_via_wfdb": row[4]
        }

    def download_physionet_sample(self, dataset_id: str, record_name: str, save_dir: Optional[str] = None) -> Dict[str, Any]:
        """
        Downloads a sample record from PhysioNet via wfdb.
        """
        try:
            import wfdb
            ds = next((d for d in LIFE_DATASET_REGISTRY if d["dataset_id"] == dataset_id), None)
            if ds is None or ds.get("physionet_slug") is None:
                return {"success": False, "error": f"Dataset {dataset_id} not available via wfdb"}
            
            if save_dir is None:
                base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                save_dir = os.path.join(base, "data", "physionet_cache", dataset_id)
                os.makedirs(save_dir, exist_ok=True)
            
            full_record = ds["physionet_slug"] + "/" + record_name
            print(f"[DuckDB] Downloading PhysioNet record: {full_record}")
            
            wfdb.dl_database(ds["physionet_slug"], dl_dir=save_dir, records=[record_name])
            
            record = wfdb.rdrecord(os.path.join(save_dir, record_name))
            signal = record.p_signal
            fs = record.fs
            num_sigs = record.n_sig
            sig_names = record.sig_name
            
            return {
                "success": True,
                "dataset_id": dataset_id,
                "record_name": record_name,
                "fs": fs,
                "num_signals": num_sigs,
                "signal_names": sig_names,
                "duration_sec": signal.shape[0] / fs,
                "total_samples": signal.shape[0],
                "saved_to": save_dir
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def close(self):
        self.con.close()


def run_duckdb_benchmark():
    print("=" * 65)
    print("  LIFE DuckDB Benchmark: Columnar Signal Analytics")
    print("=" * 65)
    
    db = LifeDuckDB(db_path=":memory:")
    
    # Generate 60s of synthetic ECG @ 250Hz = 15000 samples
    N = 15000
    np.random.seed(42)
    timestamps = list(range(1700000000000, 1700000000000 + N * 4, 4))
    raw_ecg = (2048.0 + 1400.0 * np.sin(np.linspace(0, 72 * 2 * np.pi, N))).tolist()
    filtered_ecg = (np.array(raw_ecg) - 2048.0).tolist()
    r_peaks = [abs(v - 2048) > 1300 for v in raw_ecg]
    hr_bpm = [68.0 + 4.0 * np.sin(t * 0.001) for t in timestamps]
    
    db.bulk_insert_ecg("bench_001", timestamps, raw_ecg, filtered_ecg, r_peaks, hr_bpm)
    
    t0 = time.time()
    stats = db.get_session_analytics("bench_001")
    q_time = (time.time() - t0) * 1000
    
    print(f"\n[OK] Query in {q_time:.2f}ms:")
    print(f"     Total Samples: {stats['total_samples']}")
    print(f"     Mean HR: {stats['mean_hr']:.1f} BPM")
    print(f"     R-Peaks: {stats['total_r_peaks']}")
    
    ds_stats = db.get_dataset_stats()
    print(f"\n[OK] Dataset Registry:")
    print(f"     Total Datasets: {ds_stats['total_datasets']}")
    print(f"     Total Subjects: {ds_stats['total_subjects']:,}")
    print(f"     Total Hours: {ds_stats['total_hours']:,.0f}")
    print(f"     With Apnea Labels: {ds_stats['datasets_with_apnea_labels']}")
    print(f"     Freely Accessible (wfdb): {ds_stats['freely_accessible_via_wfdb']}")
    
    db.close()
    print("\n[DONE] DuckDB benchmark complete!")
    return ds_stats


if __name__ == "__main__":
    run_duckdb_benchmark()
