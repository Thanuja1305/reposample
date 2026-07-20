import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import {
  Activity,
  History,
  MapPin,
  Settings,
  LogOut,
  User,
  Menu,
  X,
  ShieldCheck,
  Bell,
  Thermometer,
  Droplets,
  HeartPulse,
  Sparkles,
  Globe,
  ShieldAlert,
  Stethoscope,
  Heart
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

import { ref, onValue, set, update } from 'firebase/database';
import { db, rtdb } from '../../shared/lib/firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

import VitalsCard from '../components/patient/VitalsCard';
import ECGGraph from '../components/patient/ECGGraph';
import type { ECGSource } from '../components/patient/ECGGraph';
// Real clinical ECG fallback data from PhysioNet MIT-BIH Arrhythmia Database (Record 100)
import physionetData from '../../frontend/assets/physionet_mitbih.json';
const PHYSIONET_SAMPLES: number[] = (physionetData as any).samples as number[];
import AIChatWidget from '../components/patient/AIChatWidget';
import LiveLocation from './LiveLocation';
import AIAssessment from './AIAssessment';

import emergencyService from '../../backend/services/emergencyService';
import { historyService } from '../../backend/services/historyService';
import { locationService } from '../../backend/services/locationService';
import { updateLiveReading, addReadingToHistory, fetchLast10Readings } from '../../backend/services/firebaseService';

type DashboardTab =
  | 'monitoring'
  | 'history'
  | 'location'
  | 'diagnosis'
  | 'settings';

import { triggerEmergency } from '../../backend/services/emergencyService';

const classifyECG = (bpm: number, ecgData: number[], isEmergency: boolean, isAbnormal: boolean) => {
  if (bpm === 0) {
    return 'Flatline';
  }
  if (Array.isArray(ecgData) && ecgData.length > 0) {
    const maxVal = Math.max(...ecgData);
    const minVal = Math.min(...ecgData);
    if (maxVal - minVal < 10) {
      return 'Flatline';
    }
  }
  if (isEmergency || bpm < 50 || bpm > 140) {
    return 'Critical abnormality';
  }
  if (isAbnormal || bpm < 60 || bpm > 100) {
    return 'Irregular rhythm';
  }
  return 'Normal rhythm';
};

const PatientDashboard = () => {
  const activeAlertIdRef = React.useRef<string | null>(null);
  const lastWriteTimeRef = React.useRef<number>(0);
  const { logout, profile, user, showToast } = useAuth();

  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<DashboardTab>('monitoring');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isConnected, setConnected] = useState(false);
  const [firebaseConnected, setFirebaseConnected] = useState(true);
  const [showEmergencyPopup, setShowEmergencyPopup] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const emergencyAudioRef = useRef<HTMLAudioElement | null>(null);

  const [historyData, setHistoryData] = useState<any[]>([]);

  const [isGlobalActive, setIsGlobalActive] = useState(false);

  // Firebase RTDB profile state for patients/HS-001/profile
  const [rtdbProfile, setRtdbProfile] = useState<any>(null);

  // Firebase RTDB AI diagnosis state for patients/HS-001/aiDiagnosis
  const [aiDiagnosis, setAiDiagnosis] = useState<any>(null);

  // Realtime GPS location coordinates state
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [vitals, setVitals] = useState<any>(null);

  // ─── Simulation Fallback State ──────────────────────────────────────────────
  const [isSimulating, setIsSimulating] = useState(false);
  const mountTimeRef = useRef<number>(Date.now());
  const lastRealDataTimeRef = useRef<number>(0);
  const hasReceivedRealDataRef = useRef<boolean>(false);

  // ─── ECG Source Mode ────────────────────────────────────────────────────────
  // ECG_MODE controls fallback behaviour:
  //   'AUTO'      — Show live ECG if valid, else PhysioNet reference. (Default)
  //   'LIVE_ONLY' — Only show live sensor data. Show NO_SIGNAL if unavailable.
  //   'DEMO_ONLY' — Always show PhysioNet reference ECG.
  const ECG_MODE: string = 'AUTO';
  const [ecgSource, setEcgSource] = useState<ECGSource>('NO_SIGNAL');


  useEffect(() => {
    const unsubGlobal = onSnapshot(doc(db, 'emergencyStatus', 'global'), (snap) => {
      if (snap.exists()) {
        setIsGlobalActive(snap.data().active === true);
      } else {
        setIsGlobalActive(false);
      }
    }, (err) => {
      console.warn("Failed to listen to global emergency status:", err);
    });
    return () => unsubGlobal();
  }, []);

  const vitalsRef = React.useRef<any>(null);
  const profileRef = React.useRef<any>(null);
  const lastAlertTimeRef = React.useRef<number>(0);
  const lastAlertMsgRef = React.useRef<string>("");

  useEffect(() => {
    vitalsRef.current = vitals;
  }, [vitals]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // ─── ECG Source Validation ────────────────────────────────────────────────
  // Validates live ECG data quality and resolves the correct ecgSource mode.
  // Rules:
  //   1. sensorStatus must NOT be NO_FINGER, ERROR, DISCONNECTED, or OFFLINE.
  //   2. ecgStream must have > 10 samples.
  //   3. Signal must not be flat (max - min < 50 ADC units).
  useEffect(() => {
    if (ECG_MODE === 'DEMO_ONLY') {
      setEcgSource('PHYSIONET_DEMO');
      return;
    }

    if (!isConnected) {
      if (ECG_MODE === 'LIVE_ONLY') {
        setEcgSource('NO_SIGNAL');
      } else {
        // AUTO: fallback to PhysioNet when device disconnects
        setEcgSource('PHYSIONET_DEMO');
      }
      return;
    }

    // Device is connected — validate live ECG quality
    const ecgArr: number[] = vitals?.ecgData || [];
    const sensorStatusRaw = String(vitals?.sensorStatus || '').toUpperCase();
    const invalidStatuses = ['NO_FINGER', 'NOFINGER', 'ERROR', 'ECG_ERROR', 'DISCONNECTED', 'OFFLINE', 'LEADS_OFF'];
    const isBadStatus = invalidStatuses.includes(sensorStatusRaw);

    const hasEnoughSamples = ecgArr.length > 10;
    const maxVal = ecgArr.length > 0 ? Math.max(...ecgArr) : 0;
    const minVal = ecgArr.length > 0 ? Math.min(...ecgArr) : 0;
    const isFlat = (maxVal - minVal) < 50;
    const hasNonZero = ecgArr.some(v => v !== 0 && v !== 2000);

    const isLiveEcgValid = !isBadStatus && hasEnoughSamples && !isFlat && hasNonZero;

    if (isLiveEcgValid) {
      setEcgSource('LIVE_SENSOR');
    } else if (ECG_MODE === 'LIVE_ONLY') {
      setEcgSource('NO_SIGNAL');
    } else {
      // AUTO: use PhysioNet fallback
      setEcgSource('PHYSIONET_DEMO');
    }
  }, [isConnected, vitals?.ecgData, vitals?.sensorStatus, ECG_MODE]);

  useEffect(() => {
    if (vitals && (vitals.emergency || vitals.isAbnormal)) {
      setShowEmergencyPopup(true);
    } else {
      setShowEmergencyPopup(false);
    }
  }, [vitals?.emergency, vitals?.isAbnormal]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showEmergencyPopup) {
      setCountdown(10);
      timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handlePatientNeedsHelp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showEmergencyPopup]);

  const handlePatientFalseAlert = async () => {
    setShowEmergencyPopup(false);
    try {
      await update(ref(rtdb, `patients/${PATIENT_ID}/liveVitals`), {
        emergency: false,
        isAbnormal: false,
        condition: 'Normal',
        timestamp: Date.now()
      });
      await setDoc(doc(db, 'emergencyAlerts', PATIENT_ID), {
        patientId: PATIENT_ID,
        status: 'RESOLVED',
        severity: 'FALSE_ALERT',
        resolvedAt: new Date().toISOString(),
        timestamp: serverTimestamp(),
      }, { merge: true });
      if (showToast) showToast('Alert marked as false and cancelled.', 'success');
    } catch (e) {
      console.warn("Failed to mark false alert", e);
    }
  };

  const handlePatientNeedsHelp = async () => {
    setShowEmergencyPopup(false);
    if (showToast) showToast('Emergency confirmed. Notifying doctors.', 'error');
    try {
      const now = Date.now();
      const resolvedProfile = profileRef.current || rtdbProfile;
      
      // 1. Update Realtime Database liveReading path
      await update(ref(rtdb, `users/${PATIENT_ID}/liveReading`), {
        emergency: true,
        condition: 'Critical',
        deviceStatus: isConnected ? 'ONLINE' : 'OFFLINE',
        timestamp: now
      });

      // Legacy fallback paths
      await update(ref(rtdb, `patients/${PATIENT_ID}/liveVitals`), {
        emergency: true,
        condition: 'Critical',
        timestamp: now
      });

      await update(ref(rtdb, `Patients/${PATIENT_ID}/liveReading`), {
        emergency: true,
        condition: 'Critical',
        timestamp: now
      });

      // 2. Call backend send-alert endpoint
      const payload = {
        patientId: PATIENT_ID,
        patientName: resolvedProfile?.fullName || resolvedProfile?.name || resolvedProfile?.displayName || user?.displayName || 'Patient',
        age: resolvedProfile?.age || 24,
        gender: resolvedProfile?.gender || 'Unknown',
        bloodGroup: resolvedProfile?.bloodGroup || '--',
        heartRate: vitals?.bpm !== '--' ? Number(vitals?.bpm || 72) : 72,
        spo2: vitals?.spo2 !== '--' ? Number(vitals?.spo2 || 98) : 98,
        temperature_c: vitals?.temperature !== '--' ? Number(vitals?.temperature || 36.8) : 36.8,
        humidity: vitals?.humidity !== '--' ? Number(vitals?.humidity || 50) : 50,
        ecgStatus: vitals?.ecgStatus || 'Normal',
        latitude: locationCoords?.lat || 17.425834776,
        longitude: locationCoords?.lng || 78.329659494,
        deviceStatus: isConnected ? 'ONLINE' : 'OFFLINE',
        timestamp: now
      };

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      await fetch(`${apiUrl}/api/emergency/send-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn("Failed to confirm manual emergency:", e);
    }
  };


  // Start background location tracking for real-world Rapido-style mapping
  useEffect(() => {
    if (!user?.uid) return;
    const watchId = locationService.startTracking(
      user.uid,
      (coords) => {
        setLocationCoords(coords);
      },
      (err) => console.warn('[Patient GPS] Location watch warning:', err)
    );
    return () => {
      locationService.stopTracking(watchId);
    };
  }, [user]);

  // Cleanup on dashboard unmount
  useEffect(() => {
    return () => {
      // Do nothing on unmount for patient
    };
  }, []);

  // ─── PATIENT ID for Firebase RTDB ────────────────────────────────────────
  // Read from patients/HS-001/* or loggedInPatientUid (new unified RTDB structure)
  const PATIENT_ID = user?.uid || 'm1uph2bX7SVd9Wbyge1AMqAmq093';
  const DOCTOR_ID = 'DOC-001';

  // 🔥 REALTIME RTDB PROFILE LISTENER — users/${PATIENT_ID}/profile (with patients/ fallback)
  useEffect(() => {
    const profileRtdbRef = ref(rtdb, `users/${PATIENT_ID}/profile`);
    const unsubProfile = onValue(profileRtdbRef, (snap) => {
      if (snap.exists()) {
        const p = snap.val();
        setRtdbProfile(p);
      } else {
        const fallbackRef = ref(rtdb, `patients/${PATIENT_ID}/profile`);
        onValue(fallbackRef, (fallbackSnap) => {
          if (fallbackSnap.exists()) {
            setRtdbProfile(fallbackSnap.val());
          }
        }, { onlyOnce: true });
      }
    });
    return () => unsubProfile();
  }, [PATIENT_ID]);

  // 🔥 REALTIME RTDB AI DIAGNOSIS LISTENER — patients/HS-001/aiDiagnosis
  useEffect(() => {
    const diagRef = ref(rtdb, `patients/${PATIENT_ID}/aiDiagnosis`);
    const unsubDiag = onValue(diagRef, (snap) => {
      if (snap.exists()) {
        setAiDiagnosis(snap.val());
      }
    });
    return () => unsubDiag();
  }, [PATIENT_ID]);

  // 🔥 FIREBASE CONNECTION STATE LISTENER
  useEffect(() => {
    const connectedRef = ref(rtdb, '.info/connected');
    const unsub = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        setFirebaseConnected(true);
      } else {
        setFirebaseConnected(false);
      }
    });
    return () => unsub();
  }, []);

  // 🔥 REALTIME RTDB SENSOR FETCH — Patients/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading
  useEffect(() => {
    // Audit Step 1 & 2: Firebase Initialization & Auth State Log
    console.log('[Audit Step 1 & 2] Initializing RTDB Sensor Fetch Effect', {
      authenticatedUserUid: user?.uid || 'NONE',
      targetPatientId: PATIENT_ID,
      primaryPath: 'Patients/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading',
      timestamp: new Date().toISOString()
    });

    let lastHistoryWrite = 0;
    const latestVitalsMap: Record<string, any> = {};
    const latestIotMap: Record<string, any> = {};
    let latestEcgData: number[] = [];

    const vitalsPaths = [
      // ── Exact Primary Hardware Target Path ───────────────────────────────────
      `Patients/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading`,
      `Patients/${PATIENT_ID}/liveReading`,
      `Patients/HS-001/liveReading`,
      `liveReadings/VZRKMomlf4V2NVG0XXCdCSCsjwn2`,
      `liveReadings/${PATIENT_ID}`,
      `liveReadings/HS-001`,
      `patients/${PATIENT_ID}/liveVitals`,
      `users/${user?.uid || PATIENT_ID}/liveReading`,
      `users/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading`,
      `devices/ESP32_ROOM_4A/liveReading`,
      `liveHealthMetrics/${PATIENT_ID}`,
      `liveHealthMetrics/HS-001`,
    ];

    const ecgPaths = [
      `Patients/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading/ecg`,
      `Patients/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading/ecgSegment`,
      `Patients/${PATIENT_ID}/liveReading/ecg`,
      `Patients/${PATIENT_ID}/liveReading/ecgSegment`,
      `Patients/HS-001/liveReading/ecgSegment`,
      `liveReadings/VZRKMomlf4V2NVG0XXCdCSCsjwn2/ecg`,
      `liveReadings/HS-001/ecgSegment`,
      `liveReadings/HS-001/latestEcgSegment`,
      `liveReadings/${PATIENT_ID}/ecgSegment`,
      `liveReadings/${PATIENT_ID}/latestEcgSegment`,
      `patients/HS-001/liveVitals/ecgData`,
      `patients/${PATIENT_ID}/ecgValues`,
      `patients/${PATIENT_ID}/ecgData/waveform`,
      `users/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading/ecgData`,
      `users/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading/ecg`,
      `users/${user?.uid || PATIENT_ID}/liveReading/ecgData`,
      `devices/ESP32_ROOM_4A/liveReading/ecgSegment`,
    ];

    const iotDevicePaths = [
      `patients/${PATIENT_ID}/iotDevice`,
      `${PATIENT_ID}/iotDevice`,
      `users/${user?.uid || PATIENT_ID}/iotDevice`,
      `users/HS-001/iotDevice`,
      `devices/ESP32_ROOM_4A`,
    ];

    const unsubs: (() => void)[] = [];

    const updateVitals = () => {
      // Find the first path in priority order that has data
      let activeData = null;
      let activePath = '';
      for (const path of vitalsPaths) {
        if (latestVitalsMap[path]) {
          const data = latestVitalsMap[path];
          const bpm = Number(data?.heartRate || data?.bpm || data?.BPM || data?.HeartRate || 0);
          const spo2 = Number(data?.spo2 || data?.SpO2 || data?.SPO2 || data?.oxygen || data?.o2 || 0);
          const temp = Number(data?.temperature || data?.temperature_c || data?.Temperature_C || data?.temp || data?.Temp || 0);
          const hum = Number(data?.humidity || data?.Humidity || data?.hum || data?.Hum || 0);
          if (bpm > 0 || spo2 > 0 || temp > 0 || hum > 0 || data?.sensorStatus || data?.deviceStatus || data?.connected || data?.status || data?.timestamp || data?.ecg) {
            activeData = data;
            activePath = path;
            
            // Extract inline ECG array/string directly from the vitals object if present
            if (Array.isArray(data?.ecgValues) && data.ecgValues.length > 0) {
              latestEcgData = data.ecgValues.map(Number);
            } else if (Array.isArray(data?.ecgData) && data.ecgData.length > 0) {
              latestEcgData = data.ecgData.map(Number);
            } else if (Array.isArray(data?.ecg) && data.ecg.length > 0) {
              latestEcgData = data.ecg.map(Number);
            } else if (Array.isArray(data?.latestEcgSegment) && data.latestEcgSegment.length > 0) {
              latestEcgData = data.latestEcgSegment.map(Number);
            } else if (Array.isArray(data?.ecgSegment) && data.ecgSegment.length > 0) {
              latestEcgData = data.ecgSegment.map(Number);
            } else if (typeof data?.ecgValues === 'string' && data.ecgValues.trim().length > 0) {
              latestEcgData = data.ecgValues.split(',').map(Number).filter(v => !isNaN(v));
            } else if (typeof data?.ecgData === 'string' && data.ecgData.trim().length > 0) {
              latestEcgData = data.ecgData.split(',').map(Number).filter(v => !isNaN(v));
            } else if (typeof data?.ecg === 'string' && data.ecg.trim().length > 0) {
              latestEcgData = data.ecg.split(',').map(Number).filter(v => !isNaN(v));
            } else if (typeof data?.latestEcgSegment === 'string' && data.latestEcgSegment.trim().length > 0) {
              latestEcgData = data.latestEcgSegment.split(',').map(Number).filter(v => !isNaN(v));
            } else if (typeof data?.ecgSegment === 'string' && data.ecgSegment.trim().length > 0) {
              latestEcgData = data.ecgSegment.split(',').map(Number).filter(v => !isNaN(v));
            }
            break;
          }
        }
      }

      // Feature 1: Validate values & physiological ranges (Step 12)
      const liveData = activeData;
      const rawBpm = Number(liveData?.heartRate || liveData?.bpm || liveData?.BPM || liveData?.HeartRate || 0);
      const rawSpo2 = Number(liveData?.spo2 || liveData?.SpO2 || liveData?.SPO2 || liveData?.oxygen || liveData?.o2 || 0);
      const rawTemp = Number(liveData?.temperature || liveData?.temperature_c || liveData?.Temperature_C || liveData?.temp || liveData?.Temp || 0);
      const rawHum = Number(liveData?.humidity || liveData?.Humidity || liveData?.hum || liveData?.Hum || 0);
      
      // Step 12 range validation: validate parameters within realistic medical boundaries
      const bpm = (rawBpm >= 30 && rawBpm <= 220) ? rawBpm : (rawBpm > 0 ? rawBpm : 0);
      const spo2 = (rawSpo2 >= 70 && rawSpo2 <= 100) ? rawSpo2 : (rawSpo2 > 0 ? rawSpo2 : 0);
      const temp = (rawTemp >= 20 && rawTemp <= 45) ? rawTemp : (rawTemp > 0 ? rawTemp : 0);
      const hum = (rawHum >= 0 && rawHum <= 100) ? rawHum : 0;

      // Step 8: Timestamp Normalization & Freshness Check (robust seconds to ms conversion)
      let rawTs = Number(liveData?.timestamp || liveData?.updatedAt || liveData?.time || 0);
      let normalizedTs = rawTs;
      if (normalizedTs > 0 && normalizedTs < 10000000000) {
        normalizedTs = normalizedTs * 1000; // Convert 10-digit epoch seconds to milliseconds
      }
      const tsAgeMs = normalizedTs > 0 ? (Date.now() - normalizedTs) : 0;
      const isStale = normalizedTs > 0 && tsAgeMs > 60000; // Allow 60s tolerance for hardware clock drift

      // Step 7: Device Status Check
      const rawDeviceStatus = String(liveData?.deviceStatus || liveData?.status || liveData?.sensorStatus || '').toUpperCase();
      const isExplicitOffline = rawDeviceStatus === 'OFFLINE' || rawDeviceStatus === 'DISCONNECTED';

      // Sensor connection determination: active data with valid values or ONLINE status
      let sensorConnectedFromData = false;
      if (activeData) {
        const hasValidVitals = bpm > 0 || spo2 > 0 || temp > 0 || hum > 0 || (Array.isArray(latestEcgData) && latestEcgData.length > 0);
        if (!isExplicitOffline && (hasValidVitals || rawDeviceStatus === 'ONLINE' || liveData?.connected === true || !isStale)) {
          sensorConnectedFromData = true;
        }
      }

      // Audit Step 4, 5, 6, 7: Comprehensive Diagnostic Log
      console.log('[Audit Step 4-8] RTDB Telemetry Evaluation', {
        activePath: activePath || 'NONE',
        snapshotExists: !!activeData,
        rawPayload: activeData,
        rawBpm, validBpm: bpm,
        rawSpo2, validSpo2: spo2,
        rawTemp, validTemp: temp,
        rawHum, validHum: hum,
        ecgLength: latestEcgData?.length || 0,
        rawTimestamp: rawTs,
        normalizedTsMs: normalizedTs,
        tsAgeSeconds: Math.floor(tsAgeMs / 1000),
        isStale,
        rawDeviceStatus,
        isExplicitOffline,
        sensorConnectedFromData,
        finalIsConnected: sensorConnectedFromData
      });

      const connectedState = sensorConnectedFromData;

      if (connectedState) {
        setConnected(true);

        const sensorStatusStr = String(liveData?.sensorStatus || liveData?.sensor_status || '').toUpperCase();
        const isFingerOff = sensorStatusStr === 'NO_FINGER' || sensorStatusStr === 'NOFINGER';
        const isSearching = sensorStatusStr === 'SEARCHING' || sensorStatusStr === 'ACQUIRING';
        // ECG_ERROR means only the ECG leads are off — temperature / SpO2 / humidity are still valid.
        // isEcgLeadsOff is used purely to suppress ECG-derived BPM & ECG waveform display.
        const isEcgLeadsOff = sensorStatusStr === 'ECG_ERROR' || sensorStatusStr === 'LEADS_OFF' || sensorStatusStr === 'LEADSOFF';
        // isError covers genuine total-sensor failures (e.g. I2C bus error)
        const isError = sensorStatusStr === 'ERROR';

        // ─── Real Medical Thresholds & Classification ─────────────────────────────────
        // BPM from ECG is invalid when leads are off — treat same as finger-off for BPM
        const isBpmInvalid = isFingerOff || isSearching || isError || isEcgLeadsOff;
        const isBpmCritical = !isBpmInvalid && bpm > 0 && (bpm < 50 || bpm > 140);
        const isBpmWarning  = !isBpmInvalid && bpm > 0 && (bpm >= 101 && bpm <= 140); // Elevated heart rate (101-140)
        const isBpmNormal   = bpm >= 60 && bpm <= 100;

        // SpO2 / Temp / Humidity are still valid when ECG leads are off
        const isVitalsInvalid = isFingerOff || isSearching || isError;
        const isSpo2Critical = !isVitalsInvalid && (spo2 > 0 && spo2 < 90);
        const isSpo2Warning  = !isVitalsInvalid && (spo2 >= 90 && spo2 <= 94); // Warning (90-94)
        const isSpo2Normal   = spo2 >= 95;

        const isTempCritical = !isVitalsInvalid && (temp > 0 && (temp < 35 || temp > 40)); // Dangerous (<35 or >40)
        const isTempWarning  = !isVitalsInvalid && (temp >= 37.3 && temp <= 40); // Fever (37.3-40)
        const isTempNormal   = temp >= 36.1 && temp <= 37.2;

        const isHumCritical = !isVitalsInvalid && (hum > 0 && (hum < 20 || hum > 75));
        const isHumWarning  = !isVitalsInvalid && (hum > 0 && !isHumCritical && (hum < 30 || hum > 60));

        // ─── ECG Classification ──────────────────────────────────────
        const isEcgConnected = !isFingerOff && !isSearching && !isError && !isEcgLeadsOff && liveData?.ecgStatus === 'CONNECTED' && liveData?.ecgQuality === 'GOOD';
        const ecgStatus = (isFingerOff || isSearching || isError || isEcgLeadsOff) ? 'Normal' : classifyECG(bpm, latestEcgData, isBpmCritical || isSpo2Critical || isTempCritical, isBpmWarning || isSpo2Warning || isTempWarning);
        const isEcgCritical = ecgStatus === 'Flatline' || ecgStatus === 'Critical abnormality';
        const isEcgAbnormal = ecgStatus === 'Irregular rhythm';

        // ─── Emergency status logic ──────────────────────────────────
        // Do NOT trigger false emergencies when BPM = 0, SpO2 = 0, or device is standby/disconnected
        const isStandbyOrDisconnected = bpm === 0 || spo2 === 0 || isFingerOff || isSearching || isError;
        const emergencyVal = !isStandbyOrDisconnected && (liveData?.emergencyStatus === true || liveData?.emergency === true || String(liveData?.emergency) === 'true' || liveData?.isEmergency === true);
        const isAbnormalVal = !isStandbyOrDisconnected && (liveData?.isAbnormal === true || String(liveData?.isAbnormal) === 'true');

        // Trigger emergency ONLY if vitals are genuinely present and critical
        const emergency = !isStandbyOrDisconnected && (isBpmCritical || isSpo2Critical || isTempCritical || isHumCritical || isEcgCritical || emergencyVal);
        const isAbnormal = !isStandbyOrDisconnected && (isBpmWarning || isSpo2Warning || isTempWarning || isHumWarning || isEcgAbnormal || isAbnormalVal || emergency);

        // ─── AI ASSESSMENT NARRATIVE GENERATOR ─────────────────────
        const possibleConditions: string[] = [];
        const recommendations: string[] = [];
        const issues: string[] = [];

        if (spo2 > 0) {
          if (spo2 < 90) {
            issues.push("Low oxygen detected (Critical Hypoxia)");
            possibleConditions.push("Severe Hypoxia", "Respiratory Distress");
            recommendations.push("🚨 Supplemental high-flow oxygen therapy required immediately.", "Notify the on-call physician.");
          } else if (spo2 < 95) {
            issues.push("Low oxygen detected");
            possibleConditions.push("Mild Hypoxemia");
            recommendations.push("Encourage deep breathing exercises.", "Ensure patient is resting in an upright position.");
          }
        }

        if (bpm > 0) {
          if (bpm > 140) {
            issues.push("Possible severe tachycardia detected");
            possibleConditions.push("Severe Tachycardia", "SVT Risk");
            recommendations.push("Prepare emergency rate-control protocol.", "Perform immediate 12-lead ECG.");
          } else if (bpm > 100) {
            issues.push("Possible tachycardia detected");
            possibleConditions.push("Tachycardia");
            recommendations.push("Have the patient rest and hydrate.", "Monitor pulse trends closely.");
          } else if (bpm < 50) {
            issues.push("Possible severe bradycardia detected");
            possibleConditions.push("Severe Bradycardia", "AV Block Risk");
            recommendations.push("Assess for hemodynamic stability / syncope.", "Prepare atropine if symptomatic.");
          } else if (bpm < 60) {
            issues.push("Possible bradycardia detected");
            possibleConditions.push("Bradycardia");
            recommendations.push("Monitor for dizziness or fatigue.", "Review recent heart rate trends.");
          }
        }

        if (temp > 0) {
          if (temp > 40 || temp < 35) {
            issues.push(`Dangerous body temp (${temp}°C)`);
            possibleConditions.push("Thermoregulatory Failure", temp < 35 ? "Hypothermia" : "Hyperpyrexia");
            recommendations.push(temp < 35 ? "Initiate active warming measures." : "Administer antipyretics and cool compress.");
          } else if (temp > 37.2) {
            issues.push(`Fever (${temp}°C)`);
            possibleConditions.push("Fever / Pyrexia");
            recommendations.push("Monitor temperature hourly.", "Ensure hydration.");
          } else if (temp < 36.1) {
            issues.push(`Mild hypothermia (${temp}°C)`);
            possibleConditions.push("Mild Hypothermia");
            recommendations.push("Provide warm blankets.", "Recheck temperature in 30 minutes.");
          }
        }

        if (ecgStatus === 'Flatline') {
          issues.push("Flatline rhythm");
          possibleConditions.push("Asystole / Cardiac Arrest");
          recommendations.push("🚨 INITIATE CPR PROTOCOL / DEFIBRILLATOR READY", "Dispatch emergency unit immediately.");
        } else if (ecgStatus === 'Critical abnormality') {
          issues.push("Irregular cardiac rhythm detected");
          possibleConditions.push("Arrhythmia / Conduction Defect");
          recommendations.push("Continuous cardiac telemetry required.", "Obtain cardiologist consultation.");
        } else if (ecgStatus === 'Irregular rhythm') {
          issues.push("Irregular cardiac rhythm detected");
          possibleConditions.push("Cardiac Dysrhythmia");
          recommendations.push("Monitor ECG for pattern changes.", "Request clinical review.");
        }

        let staticInterpretation = "";
        if (issues.length === 0) {
          staticInterpretation = "Patient condition stable. All vitals are within normal clinical parameters. Normal rhythm observed.";
          possibleConditions.push("Stable / Healthy");
          recommendations.push("No clinical alerts detected. Continue routine telemetry monitoring.", "Maintain normal diet and hydration.");
        } else {
          staticInterpretation = `${issues.join(", ")}.`;
        }

        const now = Date.now();
        const resolvedProfile = profileRef.current || rtdbProfile;

        // 🧠 AI GENERATED POPUP ALERTS LOGIC (cooldown 15s)
        if (now - lastAlertTimeRef.current > 15000) {
          let aiMsg = "";
          if (isSpo2Critical) aiMsg = `AI Alert: Blood Oxygen critically low (${spo2}%). Immediate attention required!`;
          else if (isBpmCritical && bpm > 140) aiMsg = `AI Alert: Severe Tachycardia detected (${bpm} BPM).`;
          else if (isBpmCritical && bpm < 50) aiMsg = `AI Alert: Severe Bradycardia detected (${bpm} BPM).`;
          else if (isTempCritical && temp > 39) aiMsg = `AI Alert: Extreme Hyperthermia detected (${temp}°C).`;
          else if (isTempCritical && temp < 35) aiMsg = `AI Alert: Extreme Hypothermia detected (${temp}°C).`;
          else if (isSpo2Warning) aiMsg = `AI Notice: Blood Oxygen dropping (${spo2}%). Please take deep breaths.`;
          else if (isBpmWarning) aiMsg = `AI Notice: Abnormal Heart Rate (${bpm} BPM). Please rest.`;

          if (aiMsg && aiMsg !== lastAlertMsgRef.current) {
            showToast(aiMsg, "error");
            lastAlertMsgRef.current = aiMsg;
            lastAlertTimeRef.current = now;
          } else if (!aiMsg && lastAlertMsgRef.current !== "") {
            showToast("AI Update: Patient vitals have safely stabilized.", "success");
            lastAlertMsgRef.current = "";
            lastAlertTimeRef.current = now;
          }
        }

        // Throttled database writes (every 5 seconds) to avoid loops and rate limits
        if (now - lastWriteTimeRef.current > 5000) {
          lastWriteTimeRef.current = now;

          // Write updated emergency status back to active path if it differs
          const dbEmergency = liveData?.emergency === true || String(liveData?.emergency) === 'true';
          const dbIsAbnormal = liveData?.isAbnormal === true || String(liveData?.isAbnormal) === 'true';
          const dbCondition = liveData?.condition || '';
          
          // DO NOT auto-resolve condition if popup is active. The user must click False Alert or Request Help.
          const activeCondition = showEmergencyPopup ? 'Critical' : (emergency ? 'Critical' : isAbnormal ? 'Abnormal' : 'Normal');
          const newCondition = activeCondition;

          if (emergency !== dbEmergency || isAbnormal !== dbIsAbnormal || newCondition !== dbCondition) {
            update(ref(rtdb, activePath), {
              emergency,
              isAbnormal,
              condition: newCondition,
              timestamp: now
            }).catch(e => console.warn("Failed to sync emergency state:", e));
          }

          // Write AI report to RTDB patients/HS-001/aiDiagnosis
          // AI Diagnostic Trigger
          if (typeof (window as any).lastAiCallTime === 'undefined') (window as any).lastAiCallTime = 0;
          
          if (now - (window as any).lastAiCallTime > 15000 || (emergency && now - (window as any).lastAiCallTime > 5000)) {
            (window as any).lastAiCallTime = now;
            
            const payload = {
              patientId: PATIENT_ID,
              patientName: resolvedProfile?.fullName || resolvedProfile?.name || resolvedProfile?.displayName || user?.displayName || 'Unknown',
              age: resolvedProfile?.age || 0,
              gender: resolvedProfile?.gender || 'Unknown',
              heartRate: bpm,
              spo2,
              temperature: temp,
              humidity: hum || 0,
              signalQuality: isEcgConnected ? 'Excellent' : 'Disconnected',
              ecgStatus,
              timestamp: new Date().toISOString()
            };

            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            fetch(`${apiUrl}/api/ai/diagnose`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(aiResult => {
              if (aiResult && aiResult.summary && !aiResult.error) {
                const reportPayload = {
                  patientId: PATIENT_ID,
                  patientName: payload.patientName,
                  summary: aiResult.summary,
                  abnormalParameters: aiResult.abnormalParameters || [],
                  recommendation: aiResult.recommendation,
                  confidence: aiResult.confidence || 'N/A',
                  riskLevel: aiResult.riskLevel,
                  timestamp: Date.now(),
                  createdAt: serverTimestamp()
                };

                // Store in new /reports collection
                const reportId = `REP-${Date.now()}`;
                setDoc(doc(db, 'reports', reportId), reportPayload).catch(e => console.warn("Failed to write report to Firestore:", e));

                // Also maintain RTDB sync for the Doctor Dashboard real-time listeners
                set(ref(rtdb, `patients/${PATIENT_ID}/aiDiagnosis`), reportPayload)
                  .catch(e => console.warn("Failed to sync AI diagnosis to RTDB:", e));
              }
            })
            .catch(e => {
              console.warn("AI diagnosis fetch failed or sensor disconnected.", e);
            });
          }

          // Handle emergency alert creation in Firestore emergencyAlerts
          if (emergency && activeAlertIdRef.current === null) {
            activeAlertIdRef.current = PATIENT_ID;
            setDoc(doc(db, 'emergencyAlerts', PATIENT_ID), {
              patientId: PATIENT_ID,
              patientName: resolvedProfile?.fullName || resolvedProfile?.name || resolvedProfile?.displayName || user?.displayName || 'Patient',
              emergency: true,
              severity: 'CRITICAL',
              detectedAt: now,
              status: 'PENDING_DOCTOR_VERIFICATION',
              vitalsAtTrigger: { heartRate: bpm, spo2, temperature: temp },
              timestamp: serverTimestamp(),
              updatedAt: serverTimestamp()
            }, { merge: true }).catch(err => console.warn("Failed to create emergency alert in Firestore:", err));
          } else if (!emergency && activeAlertIdRef.current !== null) {
            activeAlertIdRef.current = null;
          }
        }

        // Throttled history write (every 1 hour)
        if (now - lastHistoryWrite > 3600000) {
          lastHistoryWrite = now;
          addReadingToHistory(user.uid, {
            ecg: latestEcgData.join(","),
            spo2,
            bpm,
            temperature: temp,
            timestamp: new Date().toISOString()
          }).catch(err => console.warn("[RTDB Sync] History append delayed:", err));
        }

        setVitals({
          bpm,
          spo2,
          humidity: hum,
          temperature: temp,
          temperature_c: temp,
          emergency,
          isAbnormal,
          isBpmCritical, isBpmWarning,
          isSpo2Critical, isSpo2Warning,
          isTempCritical, isTempWarning,
          isHumCritical, isHumWarning,
          ecgData: latestEcgData,
          ecgStatus,
          patientName: resolvedProfile?.fullName || resolvedProfile?.name || resolvedProfile?.displayName || user?.displayName || 'Patient',
          patientAge: resolvedProfile?.age || '',
          patientEmail: resolvedProfile?.email || user?.email || '',
          serialNumber: PATIENT_ID,
          alertReason: liveData?.alertReason || '',
          fingerOn: liveData?.fingerOn || false,
          timestamp: liveData?.timestamp || Date.now(),
          isFallbackData: isSimulating || (liveData?.isFallbackData === true),
          isFingerOff,
          isSearching,
          isError,
          isEcgLeadsOff
        });

        setLoading(false);
      } else {
        const timeSinceMount = Date.now() - mountTimeRef.current;
        if (!hasReceivedRealDataRef.current && timeSinceMount < 120000) {
          // During the first 120s of mount, if no real data has arrived yet,
          // we force the page to remain in loading state (skeleton loader) instead of showing "Sensor Not Detected".
          console.log(`[Simulation] Waiting for real device data... (${Math.floor(timeSinceMount / 1000)}s elapsed)`);
        } else {
          setConnected(false);
          latestEcgData = [];
          setVitals({
            bpm: '--',
            spo2: '--',
            humidity: '--',
            temperature: '--',
            temperature_c: '--',
            emergency: false,
            isAbnormal: false,
            ecgData: [],
            ecgStatus: 'Normal',
            isFallbackData: false,
            isFingerOff: false,
            isSearching: false,
            isError: false,
            deviceStatus: 'OFFLINE',
            patientName: rtdbProfile?.fullName || rtdbProfile?.name || 'Patient',
            serialNumber: PATIENT_ID
          });
          setLoading(false);
        }
      }
    };

    // Subscribe to all vitals paths
    for (const path of vitalsPaths) {
      const unsub = onValue(ref(rtdb, path), (snap) => {
        latestVitalsMap[path] = snap.exists() ? snap.val() : null;
        updateVitals();
      });
      unsubs.push(unsub);
    }

    // Subscribe to all ECG paths
    for (const path of ecgPaths) {
      const unsub = onValue(ref(rtdb, path), (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          if (Array.isArray(val)) {
            latestEcgData = val.map(Number);
          } else if (typeof val === 'string' && val.trim().length > 0) {
            latestEcgData = val.split(',').map(Number).filter((v: number) => !isNaN(v));
          } else if (typeof val === 'object' && val !== null) {
            const arr = Object.values(val);
            if (arr.length > 0) latestEcgData = arr.map(Number);
          }
          updateVitals();
        }
      });
      unsubs.push(unsub);
    }

    // Subscribe to IoT device status paths
    for (const path of iotDevicePaths) {
      const unsub = onValue(ref(rtdb, path), (snap) => {
        latestIotMap[path] = snap.exists() ? snap.val() : null;
        updateVitals();
      });
      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [user, isSimulating]);



  // 🕒 AUTOMATIC HISTORY LOGGING (Every 1 Hour)
  useEffect(() => {
    const logInterval = setInterval(() => {
      // ONLY log to history if connected AND it's NOT fallback test data
      if (vitalsRef.current && user?.uid && isConnected && !vitalsRef.current.isFallbackData) {
        console.log('[History] Automatic Snapshot Triggered');
        const currentProfile = profileRef.current;
        historyService.logVitals(user.uid, {
          ...vitalsRef.current,
          patientName: currentProfile?.fullName || currentProfile?.displayName || user?.displayName || vitalsRef.current?.patientName || 'Patient',
          patientAge: currentProfile?.age || vitalsRef.current?.patientAge || '',
          patientEmail: currentProfile?.email || user?.email || '',
        });
      }
    }, 3600000); // 1 Hour

    return () => clearInterval(logInterval);
  }, [user, isConnected]);



  // 🔥 REALTIME RTDB READINGS HISTORY LISTENER (With 1-Hour Auto-Cleanup)
  useEffect(() => {
    if (!user?.uid) return;
    const historyRtdbRef = ref(rtdb, `users/${user.uid}/readingsHistory`);
    const unsubHistory = onValue(historyRtdbRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        let history: any[] = [];
        if (Array.isArray(val)) {
          history = val.filter(Boolean);
        } else if (typeof val === 'object' && val !== null) {
          history = Object.values(val);
        }

        // Auto-cleanup: remove entries older than 1 hour dynamically
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const freshHistory = history
          .filter((item: any) => {
            const itemTime = item.timestamp ? new Date(item.timestamp).getTime() : 0;
            return itemTime >= oneHourAgo;
          })
          .map((d: any) => ({
            ...d,
            temperature_c: d.temperature !== undefined ? d.temperature : (d.temperature_c !== undefined ? d.temperature_c : 0)
          }))
          .sort((a: any, b: any) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeB - timeA;
          });

        setHistoryData(freshHistory);
      } else {
        setHistoryData([]);
      }
    }, (err) => {
      console.error("🔥 RTDB history subscription error:", err);
    });
    return () => unsubHistory();
  }, [user]);



  const navItems = [

    {
      id: 'monitoring',
      label: 'Live Monitoring',
      icon: Activity
    },

    {
      id: 'history',
      label: 'History Logs',
      icon: History
    },

    {
      id: 'location',
      label: 'Emergency Location',
      icon: MapPin
    },
    {
      id: 'diagnosis',
      label: 'AI Diagnosis',
      icon: Stethoscope
    },

    {
      id: 'settings',
      label: 'System Settings',
      icon: Settings
    }

  ];



  return (

    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">

      <AnimatePresence>

        {isSidebarOpen && (

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() =>
              setIsSidebarOpen(false)
            }
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] lg:hidden"
          />

        )}

      </AnimatePresence>



      {/* SIDEBAR */}
      <aside
          className={`fixed lg:relative w-full sm:w-80 h-full bg-[#0B1120] text-white border-r border-white/5 z-[90] flex flex-col transition-transform duration-500 lg:translate-x-0 ${
            isSidebarOpen
              ? 'translate-x-0'
              : '-translate-x-full'
          }`}
        >

        <div className="p-4 md:p-8 pb-6 md:pb-12 flex items-center justify-between">

          <div className="flex items-center gap-3">

            <div className="p-2.5 bg-accent-maroon rounded-2xl">

              <HeartPulse className="w-6 h-6 text-white" />

            </div>

            <div>

              <h1 className="text-xl font-black italic text-white">
                HeartSync
              </h1>

              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Medical Hub
              </p>

            </div>

          </div>

          <button
            onClick={() =>
              setIsSidebarOpen(false)
            }
            className="lg:hidden text-slate-400 hover:text-white"
          >

            <X className="w-6 h-6" />

          </button>

        </div>



        {/* PROFILE */}
        <div className="px-6 mb-8">
          <div 
            onClick={() => {
              navigate('/patient/profile');
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            className="bg-white/5 rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/10 relative flex flex-col justify-between min-h-[150px] cursor-pointer hover:bg-white/10 transition-all active:scale-95 group"
          >
            <div className="flex items-center gap-5">
               {/* Avatar Container */}
               <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/20 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                  {profile?.profileImage || profile?.photoURL || rtdbProfile?.profileImage || rtdbProfile?.photoURL || user?.photoURL ? (
                    <img src={profile?.profileImage || profile?.photoURL || rtdbProfile?.profileImage || rtdbProfile?.photoURL || user?.photoURL} className="w-full h-full object-cover" alt="Profile" />
                  ) : (
                    <User className="w-6 h-6 text-slate-400" strokeWidth={2} />
                  )}
               </div>
               
               {/* User Info */}
               <div className="flex flex-col min-w-0">
                  <h4 className="text-[17px] font-bold text-white tracking-tight leading-tight mb-1.5 truncate">
                    {profile?.fullName || profile?.name || profile?.displayName || rtdbProfile?.name || rtdbProfile?.fullName || vitals?.patientName || user?.displayName || 'Unknown'}
                  </h4>
                  <p className="text-[11px] font-black text-accent-maroon uppercase tracking-widest truncate">
                    {profile?.serialNumber || vitals?.serialNumber || 'HS-001'}
                  </p>
               </div>
            </div>

            {/* Live Indicator */}
            <div className="flex items-center gap-2.5 mt-6">
              <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,230,118,0.6)] ${isConnected ? 'bg-[#00e676] animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-[11px] font-black text-white uppercase tracking-widest">{isConnected ? 'RTDB LIVE' : 'OFFLINE'}</span>
            </div>
          </div>
        </div>



        {/* NAVIGATION */}
        <nav className="flex-1 px-4 space-y-1 md:space-y-2">

          {navItems.map((item) => (

            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as DashboardTab);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${
                activeTab === item.id
                  ? 'bg-accent-maroon text-white shadow-lg shadow-accent-maroon/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >

              <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-white' : 'text-slate-500'}`} />

              {item.label}

            </button>

          ))}

        </nav>



        {/* LOGOUT */}
        <div className="p-8">

          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-accent-maroon text-white hover:bg-[#600000] transition-colors rounded-2xl font-bold"
          >

            <LogOut className="w-5 h-5 text-white" />

            Sign Out

          </button>

        </div>

      </aside>



      {/* MAIN */}
      <main className={`flex-1 overflow-y-auto ${activeTab === 'location' ? 'p-0 h-screen' : 'p-4 md:p-12'}`}>

        {/* HEADER */}
        {activeTab !== 'location' && (
        <header className="flex items-center justify-between mb-6 md:mb-10">

          <div className="flex items-center gap-4">

            <button
              onClick={() =>
                setIsSidebarOpen(true)
              }
              className="lg:hidden"
            >

              <Menu className="w-6 h-6" />

            </button>

            <div>

              <h2 className="text-2xl md:text-4xl font-black italic">
                {activeTab === 'monitoring' ? 'Live Monitoring' : 
                 activeTab === 'history' ? 'Biometric History' : 
                 activeTab === 'diagnosis' ? 'AI Assessment' :
                 'System Settings'}
              </h2>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
                {activeTab === 'monitoring' ? 'Realtime Sensor Uplink' : 
                 activeTab === 'history' ? 'Archived Telemetry Logs' : 
                 activeTab === 'diagnosis' ? 'Diagnostic Core v4.2' :
                 'Configuration & Preferences'}
              </p>

            </div>

          </div>

        </header>
        )}



        {/* LOADING */}
        {loading ? (

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">

            {[...Array(5)].map((_, i) => (

              <div
                key={i}
                className="h-40 rounded-[32px] bg-white animate-pulse"
              />

            ))}

          </div>

        ) : (
          <>
            {/* CONTENT */}
            <AnimatePresence mode="wait">
          {activeTab === 'monitoring' && (
            <motion.div
              key="monitoring"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {!isConnected ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[32px] border border-slate-100 shadow-premium">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                    <Activity className="w-10 h-10 text-slate-300" />
                  </div>
                  <h3 className="text-2xl font-black italic text-slate-900 mb-2">Sensor Not Detected</h3>
                  <p className="text-sm font-bold text-slate-400 text-center max-w-md">
                    We couldn't detect an active IoT connection for your profile. Please ensure your HeartSync sensor is powered on and connected to the network.
                  </p>
                </div>
              ) : (
                <>
                  {/* VITALS */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6 mb-10">
                    {/* ── HEART RATE: hidden when ECG leads are off (BPM comes from ECG) ── */}
                    <VitalsCard
                      label="HEART RATE"
                      value={(isConnected && !vitals?.isFingerOff && !vitals?.isSearching && !vitals?.isError && !vitals?.isEcgLeadsOff && vitals?.bpm > 0) ? vitals.bpm : '--'}
                      unit="BPM"
                      icon={Heart}
                      isEmergency={vitals?.isBpmCritical && !vitals?.isFingerOff && !vitals?.isSearching && !vitals?.isError && !vitals?.isEcgLeadsOff}
                      status={(!isConnected || vitals?.isFingerOff || vitals?.isSearching || vitals?.isError || vitals?.isEcgLeadsOff) ? 'optimal' : vitals?.isBpmCritical ? 'critical' : (vitals?.bpm < 60 || vitals?.bpm > 100) ? 'warning' : 'optimal'}
                      customStatusLabel={
                        !isConnected ? 'NO SENSOR DETECTED' :
                        vitals?.isFingerOff ? 'NO FINGER DETECTED' :
                        vitals?.isSearching ? 'ACQUIRING SIGNAL...' :
                        vitals?.isEcgLeadsOff ? 'ECG LEADS OFF' :
                        vitals?.isError ? 'SENSOR ERROR' : undefined
                      }
                    />
                    {/* ── BLOOD OXYGEN: still valid when ECG leads off (MAX30102 is separate) ── */}
                    <VitalsCard
                      label="BLOOD OXYGEN"
                      value={(isConnected && !vitals?.isFingerOff && !vitals?.isSearching && !vitals?.isError && vitals?.spo2 > 0) ? vitals.spo2 : '--'}
                      unit="%"
                      icon={Activity}
                      isEmergency={vitals?.isSpo2Critical && !vitals?.isFingerOff && !vitals?.isSearching && !vitals?.isError}
                      status={(!isConnected || vitals?.isFingerOff || vitals?.isSearching || vitals?.isError) ? 'optimal' : vitals?.isSpo2Critical ? 'critical' : (vitals?.spo2 < 95) ? 'warning' : 'optimal'}
                      customStatusLabel={
                        !isConnected ? 'NO SENSOR DETECTED' :
                        vitals?.isFingerOff ? 'NO FINGER DETECTED' :
                        vitals?.isSearching ? 'ACQUIRING SIGNAL...' :
                        vitals?.isError ? 'SENSOR ERROR' : undefined
                      }
                    />
                    {/* ── TEMPERATURE: still valid when ECG leads off (DHT22 is separate) ── */}
                    <VitalsCard
                      label="TEMPERATURE"
                      value={(isConnected && !vitals?.isFingerOff && !vitals?.isSearching && !vitals?.isError && vitals?.temperature > 0) ? Number(vitals.temperature).toFixed(1) : '--'}
                      unit="°C"
                      icon={Thermometer}
                      isEmergency={vitals?.isTempCritical && !vitals?.isFingerOff && !vitals?.isSearching && !vitals?.isError}
                      status={(!isConnected || vitals?.isFingerOff || vitals?.isSearching || vitals?.isError) ? 'optimal' : vitals?.isTempCritical ? 'critical' : (vitals?.temperature > 0 && (vitals?.temperature < 36.1 || vitals?.temperature > 37.2)) ? 'warning' : 'optimal'}
                      customStatusLabel={
                        !isConnected ? 'NO SENSOR DETECTED' :
                        vitals?.isFingerOff ? 'NO FINGER DETECTED' :
                        vitals?.isSearching ? 'ACQUIRING SIGNAL...' :
                        vitals?.isError ? 'SENSOR ERROR' : undefined
                      }
                    />
                    {/* ── HUMIDITY: still valid when ECG leads off (DHT22 is separate) ── */}
                    <VitalsCard
                      label="HUMIDITY"
                      value={(isConnected && !vitals?.isFingerOff && !vitals?.isSearching && !vitals?.isError && vitals?.humidity > 0) ? vitals.humidity : '--'}
                      unit="%"
                      icon={Droplets}
                      isEmergency={vitals?.isHumCritical && !vitals?.isFingerOff && !vitals?.isSearching && !vitals?.isError}
                      status={(!isConnected || vitals?.isFingerOff || vitals?.isSearching || vitals?.isError) ? 'optimal' : vitals?.isHumCritical ? 'critical' : (vitals?.humidity < 30 || vitals?.humidity > 60) ? 'warning' : 'optimal'}
                      customStatusLabel={
                        !isConnected ? 'NO SENSOR DETECTED' :
                        vitals?.isFingerOff ? 'NO FINGER DETECTED' :
                        vitals?.isSearching ? 'ACQUIRING SIGNAL...' :
                        vitals?.isError ? 'SENSOR ERROR' : undefined
                      }
                    />
                    <VitalsCard
                      label="EMERGENCY STATUS"
                      value={!isConnected ? 'OFFLINE' : (vitals?.isFingerOff || vitals?.isSearching || vitals?.isError) ? 'STANDBY' : vitals?.isEcgLeadsOff ? 'STANDBY' : vitals?.emergency ? 'HIGH RISK' : (vitals?.isAbnormal ? 'MEDIUM RISK' : 'NORMAL')}
                      unit=""
                      icon={(!isConnected || vitals?.isFingerOff || vitals?.isSearching || vitals?.isError || vitals?.isEcgLeadsOff) ? ShieldCheck : vitals?.emergency ? ShieldAlert : ShieldCheck}
                      status={!isConnected ? 'optimal' : (vitals?.isFingerOff || vitals?.isSearching || vitals?.isError || vitals?.isEcgLeadsOff) ? 'optimal' : vitals?.emergency ? 'critical' : (vitals?.isAbnormal ? 'warning' : 'optimal')}
                      customStatusLabel={
                        !isConnected ? 'DEVICE OFFLINE' :
                        vitals?.isFingerOff ? 'NO FINGER DETECTED' :
                        vitals?.isSearching ? 'ACQUIRING SIGNAL...' :
                        vitals?.isEcgLeadsOff ? 'ECG LEADS OFF' :
                        vitals?.isError ? 'SENSOR ERROR' :
                        vitals?.emergency ? 'HIGH RISK' :
                        vitals?.isAbnormal ? 'MEDIUM RISK' : 'NORMAL'
                      }
                      isEmergency={vitals?.emergency && !vitals?.isFingerOff && !vitals?.isSearching && !vitals?.isError && !vitals?.isEcgLeadsOff}
                    />
                  </div>

                  {/* ECG */}
                  <div className="bg-white rounded-[24px] md:rounded-[40px] border border-slate-100 p-6 md:p-10 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-2xl font-black italic">Live ECG Waveform</h3>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Direct RTDB Link: {vitals?.serialNumber}</p>
                      </div>
                      <div className={`px-4 py-2 ${isConnected && vitals?.ecgData?.length > 0 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'} rounded-xl text-[10px] font-black uppercase flex items-center gap-2`}>
                        {isConnected && vitals?.ecgData?.length > 0 ? <Globe className="w-3 h-3 text-accent-maroon" /> : <div className="w-3 h-3 rounded-full bg-slate-400"></div>}
                        {isConnected && vitals?.ecgData?.length > 0 ? 'LIVE' : 'OFFLINE'}
                      </div>
                    </div>
                    
                    <div className="h-48 md:h-64">
                      <ECGGraph
                        ecgData={ecgSource === 'LIVE_SENSOR' ? (vitals?.ecgData || []) : PHYSIONET_SAMPLES}
                        bpm={vitals?.bpm ?? 0}
                        isSensorConnected={isConnected}
                        isEmergency={vitals?.emergency || vitals?.isAbnormal}
                        isCritical={vitals?.emergency}
                        ecgSource={ecgSource}
                      />
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-[24px] md:rounded-[40px] border border-slate-100 p-6 md:p-10 shadow-premium">
                 <div className="flex items-center justify-between mb-8">
                    <div>
                       <h3 className="text-2xl font-black italic">Biometric History</h3>
                       <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Last 60 Minutes • Auto-Cleanup Enabled</p>
                    </div>
                     <button 
                       onClick={async () => {
                         if (user?.uid) {
                           try {
                             const data = await fetchLast10Readings(user.uid);
                             const mappedData = data.map((d: any) => ({
                               ...d,
                               temperature_c: d.temperature !== undefined ? d.temperature : d.temperature_c
                             }));
                             setHistoryData(mappedData);
                           } catch (err) {
                             console.warn("Failed to manually reload Firestore history logs:", err);
                           }
                         }
                       }}
                       className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-accent-maroon transition-colors"
                     >
                        <History className="w-5 h-5" />
                     </button>
                 </div>

                 <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead>
                          <tr className="text-[10px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50">
                             <th className="pb-4">Time</th>
                             <th className="pb-4">BPM</th>
                             <th className="pb-4">SpO2</th>
                             <th className="pb-4">Temp</th>
                             <th className="pb-4">Condition</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {historyData.map((log: any, idx) => (
                             <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                                <td className="py-4 text-xs font-bold text-slate-400">
                                   {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </td>
                                <td className="py-4 text-sm font-black text-slate-900 italic">
                                   {log.bpm}
                                </td>
                                <td className="py-4 text-sm font-black text-accent-maroon italic">
                                   {log.spo2}%
                                </td>
                                <td className="py-4 text-sm font-black text-slate-900 italic">
                                   {log.temperature_c}°C
                                </td>
                                <td className="py-4">
                                   <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${log.isAbnormal || log.emergency ? 'bg-accent-maroon/10 text-accent-maroon' : 'bg-green-100 text-green-700'}`}>
                                      {log.emergency ? 'Emergency' : (log.isAbnormal ? 'Critical' : 'Normal')}
                                   </span>
                                </td>
                             </tr>
                          ))}
                          {historyData.length === 0 && (
                             <tr>
                                <td colSpan={5} className="py-20 text-center text-xs font-black text-slate-300 uppercase tracking-widest">
                                   No logs available for the last hour
                                </td>
                             </tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-[24px] md:rounded-[40px] border border-slate-100 p-6 md:p-10 shadow-premium">
                <h3 className="text-2xl font-black italic mb-8">Alert Preferences</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-accent-maroon/10 rounded-xl">
                        <Bell className="w-5 h-5 text-accent-maroon" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">Critical Alerts</h4>
                        <p className="text-xs font-bold text-slate-400">Receive instant push notifications for abnormal vitals</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-maroon"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-accent-maroon/10 rounded-xl">
                        <ShieldAlert className="w-5 h-5 text-accent-maroon" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">Auto-Dispatch Ambulance</h4>
                        <p className="text-xs font-bold text-slate-400">Automatically share live location during full emergencies</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-maroon"></div>
                    </label>
                  </div>
                </div>

                <h3 className="text-2xl font-black italic mt-12 mb-8">Hardware Connection</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-accent-maroon/10 rounded-xl">
                        <Activity className="w-5 h-5 text-accent-maroon" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">Sensor Calibration</h4>
                        <p className="text-xs font-bold text-slate-400">Run diagnostic check on biotelemetry hardware</p>
                      </div>
                    </div>
                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-500 hover:text-accent-maroon hover:border-accent-maroon transition-all shadow-sm">
                      Run Check
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'diagnosis' && (
            <motion.div
              key="diagnosis"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full h-full"
            >
              <AIAssessment isEmbedded={true} />
            </motion.div>
          )}

          {activeTab === 'location' && (
            <motion.div
              key="location"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full"
            >
              <LiveLocation isEmbedded={true} />
            </motion.div>
          )}
        </AnimatePresence>
        </>
        )}

      </main>

      <AIChatWidget userId={user?.uid || "sensor-node-001"} />

      <AnimatePresence>
        {showEmergencyPopup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 lg:p-8"
          >
            {/* Embedded Audio Element */}
            <audio ref={emergencyAudioRef} src="/emergency-alarm.mp3" loop autoPlay />
            
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-[900px] overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="bg-[#8B0000] p-6 pt-8 pb-6 text-center relative flex justify-between items-center">
                <div className="flex items-center gap-4 text-left">
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                    <ShieldAlert className="w-8 h-8 text-white animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-2xl tracking-tight mb-1">CRITICAL CONDITION DETECTED ({countdown}s)</h2>
                    <p className="text-white/80 text-sm font-medium">{new Date().toLocaleString()}</p>
                  </div>
                </div>
                <div className="bg-white/10 px-4 py-2 rounded-xl text-right">
                  <p className="text-white/70 text-[10px] font-black tracking-widest uppercase">Patient</p>
                  <p className="text-white font-bold text-lg">{profile?.fullName || user?.displayName || 'Patient'}</p>
                  <p className="text-white/90 text-xs">ID: {PATIENT_ID} | Age: {profile?.age || '--'}</p>
                </div>
              </div>
              
              <div className="p-6 md:p-8 bg-slate-50 flex-1 overflow-y-auto flex flex-col gap-6">
                
                {/* Vitals Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Heart Rate</p>
                    <p className="text-2xl font-black text-[#8B0000]">{vitals?.bpm || '--'} <span className="text-sm font-bold text-slate-400">BPM</span></p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">SpO2</p>
                    <p className="text-2xl font-black text-[#8B0000]">{vitals?.spo2 || '--'} <span className="text-sm font-bold text-slate-400">%</span></p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Temp</p>
                    <p className="text-2xl font-black text-[#8B0000]">{vitals?.temperature || '--'} <span className="text-sm font-bold text-slate-400">°C</span></p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Humidity</p>
                    <p className="text-2xl font-black text-slate-900">{vitals?.humidity || '--'} <span className="text-sm font-bold text-slate-400">%</span></p>
                  </div>
                </div>

                {/* AI & Location Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* AI Report */}
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-600"></div>
                    <div className="flex items-center gap-2 mb-3">
                      <Stethoscope className="w-5 h-5 text-red-600" />
                      <h4 className="font-bold text-slate-900">AI Diagnostic Summary</h4>
                    </div>
                    <div className="mb-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Risk Level: </span>
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded ml-1">{aiDiagnosis?.riskLevel || 'CRITICAL'}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-700 leading-relaxed">
                      {aiDiagnosis?.summary || aiDiagnosis?.diagnosis || 'Critical vitals detected. Please remain calm. Emergency responders and your doctor have been notified.'}
                    </p>
                  </div>

                  {/* GPS */}
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-5 h-5 text-slate-600" />
                      <h4 className="font-bold text-slate-900">Live GPS Location</h4>
                    </div>
                    <p className="text-xs font-bold text-slate-500 mb-2">Tracking active for emergency dispatch.</p>
                    <div className="h-32 w-full rounded-xl overflow-hidden bg-slate-100 relative">
                      <LiveLocation isEmbedded={true} />
                    </div>
                  </div>
                </div>

                {/* Live ECG */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 h-48 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2"><Activity className="w-4 h-4 text-[#8B0000]" /> Live ECG Waveform</h4>
                    <span className="text-[10px] font-black text-white bg-red-600 px-2 py-1 rounded animate-pulse">STREAMING</span>
                  </div>
                  <div className="flex-1 relative">
                    <ECGGraph
                      ecgData={ecgSource === 'LIVE_SENSOR' ? (vitals?.ecgData || []) : PHYSIONET_SAMPLES}
                      bpm={vitals?.bpm ?? 0}
                      isSensorConnected={isConnected}
                      isEmergency={true}
                      isCritical={true}
                      ecgSource={ecgSource}
                    />
                  </div>
                </div>

              </div>
              
              <div className="p-6 bg-white flex flex-col sm:flex-row gap-4 border-t border-slate-100">
                <button 
                  onClick={() => {
                    if (emergencyAudioRef.current) emergencyAudioRef.current.pause();
                    handlePatientNeedsHelp();
                  }}
                  className="flex-1 py-4 bg-[#8B0000] hover:bg-red-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-red-900/20 active:scale-95"
                >
                  REQUEST MEDICAL HELP
                </button>
                <button 
                  onClick={() => {
                    if (emergencyAudioRef.current) emergencyAudioRef.current.pause();
                    handlePatientFalseAlert();
                  }} 
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95"
                >
                  FALSE ALERT
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Connection Lost Banner */}
      <AnimatePresence>
        {!firebaseConnected && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-0 left-0 w-full z-[200] bg-red-600 text-white py-2 px-4 flex items-center justify-center gap-3 shadow-lg"
          >
            <ShieldAlert className="w-5 h-5 animate-pulse" />
            <span className="text-sm font-bold uppercase tracking-widest">Realtime Connection Lost. Attempting to reconnect...</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default PatientDashboard;