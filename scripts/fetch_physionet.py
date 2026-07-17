"""
PhysioNet MIT-BIH ECG Data Fetcher for HeartSync
=================================================
Fetches real clinical ECG data from MIT-BIH Arrhythmia Database (Record 100)
using the wfdb library, normalizes the signal, and saves it as a JSON asset
that the React frontend uses as a clinical fallback ECG waveform.

Usage:
  python scripts/fetch_physionet.py

Output:
  src/frontend/assets/physionet_mitbih.json
"""

import json
import os
import sys
import numpy as np

try:
    import wfdb
except ImportError:
    print("ERROR: wfdb is not installed. Run: pip install wfdb numpy")
    sys.exit(1)

# ─── Config ──────────────────────────────────────────────────────────────────
RECORD_NAME   = '100'          # MIT-BIH record 100 — normal sinus rhythm reference
LEAD          = 'MLII'         # Standard Lead II — most clinically meaningful for ECG
SAMPLE_FROM   = 0              # Start sample index
SAMPLE_COUNT  = 1800           # 5 seconds at 360 Hz sampling rate = 1800 samples
OUTPUT_SCALE  = 4096           # Target integer amplitude scale matching ESP32 ADC range
OUTPUT_DIR    = os.path.join(os.path.dirname(__file__), '..', 'src', 'frontend', 'assets')
OUTPUT_FILE   = os.path.join(OUTPUT_DIR, 'physionet_mitbih.json')


def fetch_and_normalize():
    print(f"[PhysioNet] Downloading MIT-BIH record '{RECORD_NAME}' from PhysioNet...")

    try:
        # Download and read the record from PhysioNet servers
        record = wfdb.rdrecord(
            RECORD_NAME,
            sampfrom=SAMPLE_FROM,
            sampto=SAMPLE_FROM + SAMPLE_COUNT,
            pn_dir='mitdb',
            channels=None,
        )
    except Exception as e:
        print(f"[PhysioNet] ERROR: Failed to download record — {e}")
        sys.exit(1)

    # Select the MLII lead
    sig_names = list(record.sig_name)
    if LEAD in sig_names:
        lead_idx = sig_names.index(LEAD)
    else:
        print(f"[PhysioNet] WARNING: Lead '{LEAD}' not found in record. Using first available lead: {sig_names[0]}")
        lead_idx = 0

    raw_signal = record.p_signal[:, lead_idx]  # Physical units (mV)

    print(f"[PhysioNet] Lead: {sig_names[lead_idx]} | Samples: {len(raw_signal)} | Fs: {record.fs} Hz")
    print(f"[PhysioNet] Raw amplitude range: [{raw_signal.min():.4f} mV, {raw_signal.max():.4f} mV]")

    # Remove any NaN values (replace with 0.0)
    raw_signal = np.nan_to_num(raw_signal, nan=0.0)

    # ─── Signal Normalization ──────────────────────────────────────────────
    # Map mV range → integer range compatible with ESP32 ADC (0 to OUTPUT_SCALE)
    # Center around midpoint (OUTPUT_SCALE / 2) to match real hardware readings

    sig_min = float(raw_signal.min())
    sig_max = float(raw_signal.max())
    sig_range = sig_max - sig_min

    if sig_range < 0.001:
        print("[PhysioNet] ERROR: Signal appears flat — possible bad record. Exiting.")
        sys.exit(1)

    # Normalize to [0.0, 1.0], then scale to integer ADC range
    normalized = (raw_signal - sig_min) / sig_range
    scaled = (normalized * OUTPUT_SCALE * 0.8) + (OUTPUT_SCALE * 0.1)  # 10%–90% of range
    samples_int = [int(round(v)) for v in scaled.tolist()]

    # Validate: ensure signal is not flat after normalization
    unique_values = len(set(samples_int))
    if unique_values < 10:
        print(f"[PhysioNet] ERROR: Normalized signal has only {unique_values} unique values — too flat to use.")
        sys.exit(1)

    print(f"[PhysioNet] Normalized range: [{min(samples_int)}, {max(samples_int)}] | Unique values: {unique_values}")

    # ─── Save as JSON Asset ──────────────────────────────────────────────────
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    output_data = {
        "source":       "PhysioNet MIT-BIH Arrhythmia Database",
        "record":       RECORD_NAME,
        "lead":         sig_names[lead_idx],
        "samplingRate": int(record.fs),
        "totalSamples": len(samples_int),
        "amplitudeMin": min(samples_int),
        "amplitudeMax": max(samples_int),
        "adcScale":     OUTPUT_SCALE,
        "description":  "Normal Sinus Rhythm — Clinical ECG reference waveform from MIT-BIH database. For demonstration only. Not patient data.",
        "samples":      samples_int,
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, separators=(',', ':'))

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f"\n[PhysioNet] SUCCESS: ECG asset saved to: {OUTPUT_FILE}")
    print(f"[PhysioNet]    File size: {size_kb:.1f} KB")
    print(f"[PhysioNet]    Samples:   {len(samples_int)}")
    print(f"[PhysioNet]    Duration:  {len(samples_int) / int(record.fs):.1f} seconds @ {record.fs} Hz")


if __name__ == '__main__':
    fetch_and_normalize()
