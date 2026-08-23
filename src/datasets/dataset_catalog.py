"""
LIFE Platform - Comprehensive Dataset Catalog & Downloader
Manages 14 public physiological datasets for training the LIFE AI model.
"""

import os
import json
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict

# Try importing wfdb, gracefully degrade if not available
try:
    import wfdb
    WFDB_AVAILABLE = True
except ImportError:
    WFDB_AVAILABLE = False
    print("[DATASETS] wfdb not installed. Run: pip install wfdb")


@dataclass
class DatasetInfo:
    dataset_id: str
    name: str
    source: str
    num_subjects: int
    total_hours: float
    modalities: List[str]
    has_apnea_labels: bool
    has_snore_audio: bool
    has_sleep_stages: bool
    wfdb_slug: Optional[str]     # PhysioNet slug for wfdb.dl_database()
    access_url: str
    access_type: str             # "open", "restricted_nsrr", "restricted_ieee"
    notes: str


# Full 14-dataset registry
DATASETS: List[DatasetInfo] = [
    DatasetInfo(
        dataset_id="apnea_ecg",
        name="Apnea-ECG Database",
        source="PhysioNet",
        num_subjects=70,
        total_hours=9.3,
        modalities=["ECG"],
        has_apnea_labels=True,
        has_snore_audio=False,
        has_sleep_stages=False,
        wfdb_slug="apnea-ecg/1.0.0",
        access_url="https://physionet.org/content/apnea-ecg/1.0.0/",
        access_type="open",
        notes="Classic ECG-only apnea dataset. Per-minute apnea/normal labels."
    ),
    DatasetInfo(
        dataset_id="mitbih_poly",
        name="MIT-BIH Polysomnographic Database",
        source="PhysioNet",
        num_subjects=18,
        total_hours=2.4,
        modalities=["ECG", "EEG", "EOG", "EMG", "SpO2", "Respiration"],
        has_apnea_labels=True,
        has_snore_audio=False,
        has_sleep_stages=True,
        wfdb_slug="slpdb/1.0.0",
        access_url="https://physionet.org/content/slpdb/1.0.0/",
        access_type="open",
        notes="Multi-channel sleep recording with expert sleep stage annotations."
    ),
    DatasetInfo(
        dataset_id="dreamt",
        name="DREAMT: Wearable PSG Dataset (2026)",
        source="PhysioNet",
        num_subjects=100,
        total_hours=800.0,
        modalities=["ECG", "PPG", "Actigraphy", "PSG_reference"],
        has_apnea_labels=True,
        has_snore_audio=False,
        has_sleep_stages=True,
        wfdb_slug="dreamt/1.0.0",
        access_url="https://physionet.org/content/dreamt/1.0.0/",
        access_type="open",
        notes="New 2026 dataset. Wearable + clinical PSG pairs. 100 apnea patients."
    ),
    DatasetInfo(
        dataset_id="cap_sleep",
        name="CAP Sleep Database",
        source="PhysioNet",
        num_subjects=108,
        total_hours=450.0,
        modalities=["ECG", "EEG", "EMG", "Respiration", "SpO2"],
        has_apnea_labels=True,
        has_snore_audio=False,
        has_sleep_stages=True,
        wfdb_slug="capslpdb/1.0.0",
        access_url="https://physionet.org/content/capslpdb/1.0.0/",
        access_type="open",
        notes="CAP (Cyclic Alternating Pattern) annotations. Large sleep staging dataset."
    ),
    DatasetInfo(
        dataset_id="bidmc_ppg",
        name="BIDMC PPG and Respiration",
        source="PhysioNet",
        num_subjects=53,
        total_hours=7.1,
        modalities=["ECG", "PPG", "Respiration"],
        has_apnea_labels=False,
        has_snore_audio=False,
        has_sleep_stages=False,
        wfdb_slug="bidmc/1.0.0",
        access_url="https://physionet.org/content/bidmc/1.0.0/",
        access_type="open",
        notes="Reference waveform for ECG-derived respiration (EDR) validation."
    ),
    DatasetInfo(
        dataset_id="fantasia",
        name="Fantasia Database (Young vs Elderly HRV)",
        source="PhysioNet",
        num_subjects=40,
        total_hours=20.0,
        modalities=["ECG", "Respiration"],
        has_apnea_labels=False,
        has_snore_audio=False,
        has_sleep_stages=False,
        wfdb_slug="fantasia/1.0.0",
        access_url="https://physionet.org/content/fantasia/1.0.0/",
        access_type="open",
        notes="HRV aging study. 20 young + 20 elderly subjects."
    ),
    DatasetInfo(
        dataset_id="psg_audio",
        name="PSG-Audio (ScienceDB)",
        source="ScienceDB",
        num_subjects=212,
        total_hours=1800.0,
        modalities=["ECG", "EEG", "EMG", "Tracheal_Audio_16kHz", "Ambient_Audio_16kHz"],
        has_apnea_labels=True,
        has_snore_audio=True,
        has_sleep_stages=True,
        wfdb_slug=None,
        access_url="https://www.sciencedb.cn/en/detail?dataSetId=797746401676656640",
        access_type="open",
        notes="CRITICAL for LIFE: has synchronized ECG + audio. Apnea, snore, arousal labels. doi:10.11922/sciencedb.00345"
    ),
    DatasetInfo(
        dataset_id="ucddb",
        name="UCD Sleep Apnea Database",
        source="PhysioNet",
        num_subjects=25,
        total_hours=200.0,
        modalities=["ECG", "SpO2", "Nasal_Airflow", "Chest_Effort", "EEG"],
        has_apnea_labels=True,
        has_snore_audio=False,
        has_sleep_stages=True,
        wfdb_slug="ucddb/1.0.0",
        access_url="https://physionet.org/content/ucddb/1.0.0/",
        access_type="open",
        notes="Per-second apnea annotations with respiratory signals."
    ),
    DatasetInfo(
        dataset_id="nstdb",
        name="MIT-BIH Noise Stress Test",
        source="PhysioNet",
        num_subjects=12,
        total_hours=5.0,
        modalities=["ECG", "Motion_Artifact", "BW_Noise"],
        has_apnea_labels=False,
        has_snore_audio=False,
        has_sleep_stages=False,
        wfdb_slug="nstdb/1.0.0",
        access_url="https://physionet.org/content/nstdb/1.0.0/",
        access_type="open",
        notes="ECG with motion artifact noise. Useful for training robust preprocessing."
    ),
    DatasetInfo(
        dataset_id="challenge2018",
        name="PhysioNet Challenge 2018: Sleep Classification",
        source="PhysioNet",
        num_subjects=1985,
        total_hours=15000.0,
        modalities=["ECG", "EEG", "EMG", "EOG", "SpO2", "Respiration"],
        has_apnea_labels=True,
        has_snore_audio=False,
        has_sleep_stages=True,
        wfdb_slug="challenge-2018/1.0.0",
        access_url="https://physionet.org/content/challenge-2018/1.0.0/",
        access_type="open",
        notes="Almost 2000 PSG recordings. Key benchmark for automated sleep staging."
    ),
    DatasetInfo(
        dataset_id="icentia11k",
        name="Icentia11k: Long-Term Wearable ECG",
        source="PhysioNet",
        num_subjects=11000,
        total_hours=131000.0,
        modalities=["ECG_single_lead"],
        has_apnea_labels=False,
        has_snore_audio=False,
        has_sleep_stages=False,
        wfdb_slug="icentia11k/1.0",
        access_url="https://physionet.org/content/icentia11k/1.0/",
        access_type="open",
        notes="LARGEST open ECG: 11,000 patients, 131,000+ hours. 14-day recordings. Arrhythmia labels."
    ),
    DatasetInfo(
        dataset_id="mesa_sleep",
        name="MESA Sleep Study (NSRR)",
        source="NSRR",
        num_subjects=2056,
        total_hours=12000.0,
        modalities=["PSG", "ECG", "EEG", "Actigraphy", "Questionnaires"],
        has_apnea_labels=True,
        has_snore_audio=False,
        has_sleep_stages=True,
        wfdb_slug=None,
        access_url="https://sleepdata.org/datasets/mesa",
        access_type="restricted_nsrr",
        notes="Requires NSRR access agreement (free). 2000+ subjects. Large epidemiological study."
    ),
    DatasetInfo(
        dataset_id="shhs",
        name="Sleep Heart Health Study (SHHS)",
        source="NSRR",
        num_subjects=5804,
        total_hours=45000.0,
        modalities=["PSG", "ECG", "Cardiovascular_Followup"],
        has_apnea_labels=True,
        has_snore_audio=False,
        has_sleep_stages=True,
        wfdb_slug=None,
        access_url="https://sleepdata.org/datasets/shhs",
        access_type="restricted_nsrr",
        notes="LARGEST: 5804 subjects, 45,000 hours. Gold standard sleep apnea epidemiology dataset."
    ),
    DatasetInfo(
        dataset_id="mitdb",
        name="MIT-BIH Arrhythmia Database",
        source="PhysioNet",
        num_subjects=48,
        total_hours=24.0,
        modalities=["ECG_dual_lead"],
        has_apnea_labels=False,
        has_snore_audio=False,
        has_sleep_stages=False,
        wfdb_slug="mitdb/1.0.0",
        access_url="https://physionet.org/content/mitdb/1.0.0/",
        access_type="open",
        notes="Classic arrhythmia benchmark. 19 beat classes annotated by cardiologists."
    ),
]


class DatasetCatalog:
    """LIFE Dataset Catalog — manages all 14 training datasets."""

    def __init__(self, cache_dir: Optional[str] = None):
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if cache_dir is None:
            cache_dir = os.path.join(base, "data", "physionet_cache")
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)

    def summary(self) -> Dict[str, Any]:
        open_ds = [d for d in DATASETS if d.access_type == "open"]
        apnea_ds = [d for d in DATASETS if d.has_apnea_labels]
        audio_ds = [d for d in DATASETS if d.has_snore_audio]
        return {
            "total_datasets": len(DATASETS),
            "total_subjects": sum(d.num_subjects for d in DATASETS),
            "total_hours": round(sum(d.total_hours for d in DATASETS), 0),
            "open_access": len(open_ds),
            "with_apnea_labels": len(apnea_ds),
            "with_audio": len(audio_ds),
            "wfdb_accessible": len([d for d in DATASETS if d.wfdb_slug]),
            "total_open_hours": round(sum(d.total_hours for d in open_ds), 0),
            "largest_dataset": max(DATASETS, key=lambda d: d.total_hours).name,
        }

    def print_catalog(self):
        s = self.summary()
        print("\n" + "=" * 72)
        print("  LIFE Dataset Registry — Full Catalog")
        print("=" * 72)
        print(f"  Datasets  : {s['total_datasets']}")
        print(f"  Subjects  : {s['total_subjects']:,}")
        print(f"  Hours     : {s['total_hours']:,.0f}")
        print(f"  Open Access: {s['open_access']} datasets ({s['total_open_hours']:.0f}h)")
        print(f"  Apnea Labels: {s['with_apnea_labels']} datasets")
        print(f"  With Audio: {s['with_audio']} datasets")
        print(f"  Largest: {s['largest_dataset']}")
        print("-" * 72)
        print(f"  {'ID':<20} {'Subj':>6} {'Hours':>8}  {'Modalities'}")
        print("-" * 72)
        for ds in sorted(DATASETS, key=lambda d: -d.total_hours):
            mods = ", ".join(ds.modalities[:3])
            if len(ds.modalities) > 3:
                mods += f" +{len(ds.modalities)-3}"
            lock = "[OPEN]" if ds.access_type == "open" else "[RESTRICTED]"
            print(f"  {ds.dataset_id:<20} {ds.num_subjects:>6} {ds.total_hours:>8.0f}  {mods} {lock}")
        print("=" * 72)

    def download_physionet(self, dataset_id: str, records: Optional[List[str]] = None) -> bool:
        """Download records from a PhysioNet dataset via wfdb."""
        if not WFDB_AVAILABLE:
            print("[DATASETS] ERROR: wfdb not installed. Run: pip install wfdb")
            return False
        ds = next((d for d in DATASETS if d.dataset_id == dataset_id), None)
        if ds is None:
            print(f"[DATASETS] Unknown dataset: {dataset_id}")
            return False
        if ds.wfdb_slug is None:
            print(f"[DATASETS] {dataset_id} is not available via wfdb (NSRR-only).")
            print(f"  Access at: {ds.access_url}")
            return False

        save_dir = os.path.join(self.cache_dir, dataset_id)
        os.makedirs(save_dir, exist_ok=True)
        print(f"[DATASETS] Downloading {ds.name} from PhysioNet...")
        print(f"  Slug: {ds.wfdb_slug}")
        print(f"  Save: {save_dir}")

        try:
            wfdb.dl_database(ds.wfdb_slug, dl_dir=save_dir, records=records)
            print(f"[DATASETS] [OK] Downloaded {ds.name}")
            return True
        except Exception as e:
            print(f"[DATASETS] ERROR: {e}")
            return False

    def load_record(self, dataset_id: str, record_name: str) -> Optional[Dict[str, Any]]:
        """Load a cached PhysioNet record as numpy arrays."""
        if not WFDB_AVAILABLE:
            return None
        record_path = os.path.join(self.cache_dir, dataset_id, record_name)
        if not os.path.exists(record_path + ".hea"):
            print(f"[DATASETS] Record not downloaded yet: {record_name}")
            return None
        try:
            record = wfdb.rdrecord(record_path)
            annotation_path = record_path
            try:
                ann = wfdb.rdann(annotation_path, "apn")
                annotations = {"samples": ann.sample.tolist(), "symbols": ann.symbol}
            except Exception:
                annotations = None

            return {
                "dataset_id": dataset_id,
                "record_name": record_name,
                "fs": record.fs,
                "n_sig": record.n_sig,
                "sig_name": record.sig_name,
                "duration_sec": record.sig_len / record.fs,
                "signal": record.p_signal,
                "annotations": annotations,
            }
        except Exception as e:
            print(f"[DATASETS] Error loading record: {e}")
            return None

    def save_catalog_json(self, path: Optional[str] = None):
        """Export the catalog as JSON for the Next.js dashboard."""
        if path is None:
            path = os.path.join(self.cache_dir, "dataset_catalog.json")
        catalog = {
            "summary": self.summary(),
            "datasets": [asdict(d) for d in DATASETS],
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(catalog, f, indent=2)
        print(f"[DATASETS] Saved catalog JSON: {path}")
        return path


if __name__ == "__main__":
    catalog = DatasetCatalog()
    catalog.print_catalog()
    catalog.save_catalog_json()
    print("\n[OK] Dataset catalog complete!")
