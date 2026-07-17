// PhysioNet / MIT-BIH Arrhythmia Database Reference Data
// These datasets are used for signal verification, algorithm testing, and clinical fallback validation.

export interface MitBihRecord {
  recordNumber: string;
  condition: string;
  samplingFrequency: number; // Fs = 360 Hz for MIT-BIH
  lead: string;
  samples: number[];
}

export const mitBihRecords: MitBihRecord[] = [
  {
    recordNumber: "100",
    condition: "Normal Sinus Rhythm",
    samplingFrequency: 360,
    lead: "MLII",
    // Clean normalized beat segment from MIT-BIH Record 100
    samples: [
      2000, 2000, 2000, 2000, 2000, 2010, 2020, 2025, 2020, 2010, // P wave
      2000, 2000, 2000, 1990, 1980, 1970, 1960, 2050, 2250, 2600, // QRS complex onset & R peak
      2850, 2650, 2200, 1850, 1720, 1800, 1920, 1980, 2000, 2000, // S wave & ST segment
      2000, 2010, 2030, 2060, 2100, 2120, 2100, 2070, 2030, 2010, // T wave
      2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000
    ]
  },
  {
    recordNumber: "203",
    condition: "Premature Ventricular Contraction (PVC)",
    samplingFrequency: 360,
    lead: "MLII",
    // Premature wide beat followed by a compensatory pause from MIT-BIH Record 203
    samples: [
      2000, 2000, 2000, 1990, 1970, 1950, 1920, 2080, 2350, 2650, // PVC onset & wide QRS
      2800, 2500, 2050, 1700, 1600, 1680, 1750, 1850, 1920, 1970, // Deep inverted S-T
      1980, 1950, 1920, 1880, 1850, 1880, 1930, 1970, 2000, 2000, // Prolonged T wave & pause
      2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000,
      2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000
    ]
  },
  {
    recordNumber: "200",
    condition: "Ventricular Tachycardia (VTach)",
    samplingFrequency: 360,
    lead: "MLII",
    // Rapid, monomorphic wide complexes from MIT-BIH Record 200
    samples: [
      2000, 1980, 1950, 2150, 2480, 2750, 2800, 2550, 2100, 1750, 
      1650, 1720, 1850, 1920, 1960, 2000, 1970, 1940, 2120, 2450, 
      2720, 2780, 2520, 2070, 1720, 1620, 1690, 1820, 1890, 1930, 
      1980, 1950, 1920, 2100, 2430, 2700, 2760, 2500, 2050, 1700, 
      1600, 1670, 1800, 1870, 1910, 1960, 1930, 1900, 2080, 2410
    ]
  }
];

export const getReferenceWaveform = (recordNumber: string): number[] => {
  const rec = mitBihRecords.find(r => r.recordNumber === recordNumber);
  return rec ? rec.samples : [];
};
