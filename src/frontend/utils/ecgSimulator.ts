/**
 * Realistic Human ECG Waveform Simulator
 * Generates continuous physiological P-QRS-T cardiac cycles at 250 Hz sampling rate.
 */
export interface ECGGeneratorOptions {
  heartRate?: number;
  samplingRate?: number;
  samples?: number;
}

/**
 * Generate a single ECG sample given a normalized cardiac cycle phase (0.0 - 1.0).
 */
export function generateECGSample(phase: number): number {
  let val = 2000; // Baseline ADC value

  if (phase >= 0.12 && phase <= 0.22) {
    // P wave (atrial depolarization)
    const pPhase = (phase - 0.17) / 0.05;
    val += 120 * Math.exp(-Math.pow(pPhase * 2.5, 2));
  } else if (phase >= 0.36 && phase < 0.385) {
    // Q wave (initial septal deflection)
    const qPhase = (phase - 0.3725) / 0.0125;
    val -= 180 * Math.exp(-Math.pow(qPhase * 3, 2));
  } else if (phase >= 0.385 && phase <= 0.415) {
    // R peak (ventricular depolarization spike)
    const rPhase = (phase - 0.40) / 0.015;
    val += 850 * Math.exp(-Math.pow(rPhase * 3, 2));
  } else if (phase > 0.415 && phase <= 0.44) {
    // S wave (late ventricular depolarization)
    const sPhase = (phase - 0.4275) / 0.0125;
    val -= 300 * Math.exp(-Math.pow(sPhase * 3, 2));
  } else if (phase >= 0.58 && phase <= 0.74) {
    // T wave (ventricular repolarization)
    const tPhase = (phase - 0.66) / 0.08;
    val += 220 * Math.exp(-Math.pow(tPhase * 2.5, 2));
  }

  // Subtle physiological baseline noise & respiratory variation
  const noise = (Math.random() - 0.5) * 12;
  const wander = Math.sin(phase * Math.PI * 2) * 15;

  return val + noise + wander;
}

/**
 * Generate an array of realistic ECG samples for a specified heart rate.
 */
export function generateECG(options: ECGGeneratorOptions = {}): number[] {
  const heartRate = options.heartRate || 72;
  const Fs = options.samplingRate || 250;
  const sampleCount = options.samples || 250;

  const rrPeriodSec = 60 / Math.max(40, Math.min(180, heartRate));
  const samplesPerBeat = Math.floor(rrPeriodSec * Fs);

  const samples: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const phase = (i % samplesPerBeat) / samplesPerBeat;
    samples.push(generateECGSample(phase));
  }
  return samples;
}
