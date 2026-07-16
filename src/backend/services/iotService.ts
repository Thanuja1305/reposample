import { ref, onValue, off } from "firebase/database";
import { doc, onSnapshot, collection, query, orderBy, limit, setDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db, rtdb } from '../../shared/lib/firebase';

/**
 * Shape of live health metrics written by the real IoT device.
 * The IoT hardware (e.g. Arduino + ESP8266/ESP32) writes to Firebase Realtime Database
 * at: liveHealthMetrics/{patientId}
 *
 * This service ONLY reads data — it never generates or writes fake values.
 */
export interface HealthMetrics {
  // Accept both naming conventions (bpm / heartRate, spo2 / o2, temperature / temp)
  bpm?: number;
  heartRate?: number;
  spo2?: number;
  o2?: number;
  temperature?: number;
  temp?: number;
  humidity?: number;
  ecg?: number[];
  isEmergency?: boolean;
  motionStatus?: string;
  location?: { latitude: number; longitude: number };
  timestamp?: any;
  status?: string;
}

/** Emergency thresholds — used for alert detection, NOT for generating data */
export const EMERGENCY_THRESHOLDS = {
  heartRateHigh: 120,  // BPM
  heartRateLow: 45,    // BPM
  spo2Low: 90,         // %
  temperatureHigh: 39, // °C
  temperatureLow: 35,  // °C
};

/**
 * Determines whether a given vitals snapshot triggers an emergency.
 * Used by the dashboard to decide whether to surface an alert.
 */
export function isEmergencyVitals(metrics: HealthMetrics): boolean {
  const hr = metrics.bpm ?? metrics.heartRate ?? null;
  const spo2 = metrics.spo2 ?? metrics.o2 ?? null;
  const temp = metrics.temperature ?? metrics.temp ?? null;

  if (hr !== null && (hr > EMERGENCY_THRESHOLDS.heartRateHigh || hr < EMERGENCY_THRESHOLDS.heartRateLow)) return true;
  if (spo2 !== null && spo2 < EMERGENCY_THRESHOLDS.spo2Low) return true;
  if (temp !== null && (temp > EMERGENCY_THRESHOLDS.temperatureHigh || temp < EMERGENCY_THRESHOLDS.temperatureLow)) return true;
  if (metrics.isEmergency === true) return true;

  return false;
}

/**
 * Subscribe to live health metrics for a patient from Firebase Realtime Database.
 *
 * The IoT device writes to: rtdb -> liveHealthMetrics/{patientId}
 * This listener reflects those writes instantly — no polling, no simulation.
 *
 * @param patientId - The Firebase Auth UID of the patient
 * @param onData    - Callback called with each new metrics snapshot
 * @param onError   - Callback called on connection error
 * @returns Unsubscribe function — call this on component unmount
 */
export function subscribeToLiveMetrics(
  patientId: string,
  onData: (metrics: HealthMetrics) => void,
  onError?: (error: Error) => void
): () => void {
  const metricsRef = ref(rtdb, `liveHealthMetrics/${patientId}`);

  const unsubscribe = onValue(
    metricsRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onData(snapshot.val() as HealthMetrics);
      }
    },
    (error) => {
      console.error(`[IoT] Realtime Database stream error for ${patientId}:`, error);
      if (onError) onError(error);
    }
  );

  return () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };
}

/**
 * Subscribe to live health metrics from Firestore (alternative path).
 * Some IoT pipeline configurations write to Firestore via Cloud Functions.
 *
 * @param patientId - The Firebase Auth UID of the patient
 * @param onData    - Callback called with each new metrics snapshot
 * @param onError   - Callback called on connection error
 * @returns Unsubscribe function
 */
export function subscribeToFirestoreMetrics(
  patientId: string,
  onData: (metrics: HealthMetrics | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'liveHealthMetrics', patientId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as HealthMetrics) : null);
    },
    (error) => {
      console.error(`[IoT] Firestore metrics stream error for ${patientId}:`, error);
      if (onError) onError(error);
    }
  );
}

/**
 * Subscribe to patient history logs from Firestore.
 * These are written by the IoT pipeline (e.g., Cloud Function triggered by RTDB writes).
 *
 * @param patientId - The Firebase Auth UID of the patient
 * @param onData    - Callback called with the latest history entries
 * @param maxEntries - Maximum number of history entries to fetch (default 20)
 * @returns Unsubscribe function
 */
export function subscribeToPatientHistory(
  patientId: string,
  onData: (logs: any[]) => void,
  maxEntries = 20
): () => void {
  const q = query(
    collection(db, 'patientHistory', patientId, 'logs'),
    orderBy('timestamp', 'desc'),
    limit(maxEntries)
  );

  return onSnapshot(q, (snap) => {
    onData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/**
 * Write an emergency alert to Firestore when detected from real sensor data.
 * This is called by the dashboard ONLY when real threshold violations are detected.
 *
 * @param patientId   - UID of the patient
 * @param patientName - Display name of the patient
 * @param metrics     - The current live metrics snapshot that triggered the alert
 */
export async function triggerEmergencyAlert(
  patientId: string,
  patientName: string,
  metrics: HealthMetrics
): Promise<void> {
  const hr = metrics.bpm ?? metrics.heartRate;
  const spo2 = metrics.spo2 ?? metrics.o2;
  const temp = metrics.temperature ?? metrics.temp;

  try {
    // Write to emergencyAlerts — visible to doctor dashboard via onSnapshot
    await setDoc(doc(db, 'emergencyAlerts', patientId), {
      patientId,
      patientName,
      emergency: true,
      severity: "CRITICAL",
      detectedAt: Date.now(),
      status: "PENDING",
      vitalsAtTrigger: { heartRate: hr, spo2, temperature: temp },
      verifiedBy: null,
      verifiedAt: null,
    }, { merge: true });

    // Write notification for the patient
    await setDoc(
      doc(db, 'notifications', `${patientId}_emergency_${Date.now()}`),
      {
        userId: patientId,
        type: 'EMERGENCY',
        title: 'Critical Health Alert',
        message: `Emergency detected: BPM ${hr?.toFixed(0) ?? '--'}, SpO2 ${spo2?.toFixed(1) ?? '--'}%`,
        severity: 'Critical',
        read: false,
        createdAt: serverTimestamp(),
      }
    );
  } catch (error) {
    console.error('[IoT] Failed to write emergency alert:', error);
  }
}
