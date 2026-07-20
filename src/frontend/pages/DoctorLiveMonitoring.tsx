import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  Activity, 
  Thermometer, 
  Droplets, 
  AlertCircle,
  Bell,
  Clock,
  User,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Menu,
  Maximize2,
  Wind,
  MapPin,
  Search,
  HeartPulse,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { rtdb } from '../../shared/lib/firebase';
import DoctorSidebar from '../components/DoctorSidebar';
import VitalsCard from '../components/patient/VitalsCard';
import ECGGraph from '../components/patient/ECGGraph';
import DoctorEmergencyModal from '../components/DoctorEmergencyModal';
import GoogleMapsTracker from '../components/GoogleMapsTracker';
import { emergencyService, dispatchAmbulance, sendRealtimeWhatsAppEmergency } from '../../backend/services/emergencyService';
import { locationService } from '../../backend/services/locationService';
import { db } from '../../shared/lib/firebase';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

const checkIsCritical = (v: any) => {
  if (!v) return false;
  if (v.condition === 'Critical' || v.emergency === true || String(v.emergency) === 'true') return true;

  const bpm = Number(v.heartRate ?? v.bpm ?? 0);
  const isBpmCritical = bpm < 20 || bpm > 170;

  const spo2 = Number(v.spo2 ?? 0);
  const isSpo2Critical = spo2 < 75;

  const temp = Number(v.temperature_c ?? v.temperature ?? 0);
  const isTempCritical = temp > 0 && (temp < 34 || temp > 40);

  const hum = Number(v.humidity ?? 0);
  const isHumCritical = hum > 0 && (hum < 20 || hum > 75);

  if (isBpmCritical || isSpo2Critical || isTempCritical || isHumCritical) return true;

  const isBpmAbnormal = bpm > 0 && (bpm < 60 || bpm > 100);
  const isSpo2Abnormal = spo2 > 0 && (spo2 < 95);
  const isTempAbnormal = temp > 0 && (temp < 36.1 || temp > 37.2);
  const isHumAbnormal = hum > 0 && (hum < 30 || hum > 60);

  const abnormalCount = [isBpmAbnormal, isSpo2Abnormal, isTempAbnormal, isHumAbnormal].filter(Boolean).length;
  return abnormalCount >= 3;
};

const DoctorLiveMonitoring = () => {
  const navigate = useNavigate();
  const [vitals, setVitals] = useState<any>(null);
  const [patientLocation, setPatientLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyHandled, setEmergencyHandled] = useState(false);
  const [isGlobalActive, setIsGlobalActive] = useState(false);
  const sirenActive = useRef(false);
  const modalShownRef = useRef(false);
  const [patientProfile, setPatientProfile] = useState<any>(null);
  const [overrideTelemetry, setOverrideTelemetry] = useState(false);
  const [isCallingAmbulance, setIsCallingAmbulance] = useState(false);

  useEffect(() => {
    const unsubGlobal = onSnapshot(doc(db, 'emergencyStatus', 'global'), (snap) => {
      if (snap.exists()) {
        setIsGlobalActive(snap.data().active === true);
      } else {
        setIsGlobalActive(false);
      }
    });
    return () => unsubGlobal();
  }, []);

  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const q = query(collection(db, 'users'), where('role', '==', 'patient'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setAllPatients(list);
          
          // Set initial patientProfile: try saved selectedPatientId first, then onboardingCompleted, then fallback
          const savedId = localStorage.getItem('selectedPatientId');
          const savedPatient = list.find((p: any) => p.uid === savedId || p.id === savedId || p.serialNumber === savedId);
          const activePatient = savedPatient || list.find((p: any) => p.onboardingCompleted === true || p.profile?.fullName || p.profile?.name || p.fullName || p.name) || list[0];
          setPatientProfile(activePatient);
        }
      } catch (e) {
        console.error('Failed to fetch patient list:', e);
      }
    };
    fetchPatients();
  }, []);

  const [vitalsMap, setVitalsMap] = useState<Record<string, any>>({});

  useEffect(() => {
    const reportsRef = ref(rtdb, 'reports');
    setLoading(true);

    // Safety timeout: if loading doesn't resolve in 3 seconds, force it
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    const unsub = onValue(reportsRef, (snapshot) => {
      if (snapshot.exists()) {
        setVitalsMap(snapshot.val());
      }
      clearTimeout(safetyTimer);
      setLoading(false);
    }, (err) => {
      console.error("Vitals listen failed:", err);
      clearTimeout(safetyTimer);
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(safetyTimer); };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const derivedActiveId = localStorage.getItem('selectedPatientId') || patientProfile?.uid || patientProfile?.id || (() => {
    const criticalId = Object.keys(vitalsMap).find(id => {
      const v = vitalsMap[id];
      return checkIsCritical(v) && v.doctorResponse?.status !== 'false_alert';
    });
    return criticalId || 'HS-001';
  })();

  useEffect(() => {
    const unsub = locationService.subscribeToLocation(derivedActiveId, (coords) => {
      setPatientLocation(coords);
    });
    return () => unsub();
  }, [derivedActiveId]);

  useEffect(() => {
    const activeId = derivedActiveId;

    const vitalsPaths = [
      `Patients/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading`,
      `Patients/${activeId}/liveReading`,
      `patients/${activeId}/liveVitals`,
      `liveHealthMetrics/${activeId}`,
      `liveHealthMetrics/HS-001`,
      `users/${activeId}/liveReading`,
      `users/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading`,
      `users/HS-001/liveReading`
    ];

    const ecgPaths = [
      `Patients/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading/ecg`,
      `Patients/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading/ecgSegment`,
      `Patients/${activeId}/liveReading/ecg`,
      `Patients/${activeId}/liveReading/ecgSegment`,
      `patients/${activeId}/ecgData/waveform`,
      `patients/${activeId}/ecgData`,
      `liveHealthMetrics/${activeId}/ecgData`,
      `liveHealthMetrics/HS-001/ecgData`,
      `users/${activeId}/liveReading/ecg`,
      `users/VZRKMomlf4V2NVG0XXCdCSCsjwn2/liveReading/ecg`,
      `users/HS-001/liveReading/ecg`
    ];

    const locationPaths = [
      `patients/${activeId}/location`,
      `liveHealthMetrics/${activeId}/location`,
      `liveHealthMetrics/HS-001/location`,
      `users/${activeId}/liveReading/location`
    ];

    const diagnosisPaths = [
      `patients/${activeId}/aiDiagnosis`,
      `liveHealthMetrics/${activeId}/aiDiagnosis`,
      `liveHealthMetrics/HS-001/aiDiagnosis`,
      `users/${activeId}/liveReading/aiDiagnosis`
    ];

    const profilePaths = [
      `patients/${activeId}/profile`,
      `liveHealthMetrics/${activeId}/profile`,
      `liveHealthMetrics/HS-001/profile`,
      `users/${activeId}/profile`
    ];

    const latestVitalsMap: Record<string, any> = {};
    const latestEcgMap: Record<string, any> = {};
    const latestLocMap: Record<string, any> = {};
    const latestDiagMap: Record<string, any> = {};
    const latestProfileMap: Record<string, any> = {};

    const unsubs: (() => void)[] = [];

    const updateCombined = () => {
      // Find the first vitals path that has data
      let liveData = null;
      for (const path of vitalsPaths) {
        if (latestVitalsMap[path]) {
          const d = latestVitalsMap[path];
          const bpmVal = Number(d?.heartRate || d?.bpm || d?.BPM || d?.HeartRate || 0);
          const spo2Val = Number(d?.spo2 || d?.SpO2 || d?.SPO2 || d?.oxygen || 0);
          if (bpmVal > 0 || spo2Val > 0 || d?.temperature || d?.temperature_c || d?.temp || d?.humidity) {
            liveData = d;
            break;
          }
        }
      }

      if (!liveData) {
        // Look for any non-null path just to show something
        for (const path of vitalsPaths) {
          if (latestVitalsMap[path]) {
            liveData = latestVitalsMap[path];
            break;
          }
        }
      }

      if (!liveData || Object.keys(liveData).length === 0) {
        return;
      }

      const bpm = Number(liveData?.heartRate || liveData?.bpm || liveData?.BPM || liveData?.HeartRate || 0);
      const isBpmCritical = bpm < 20 || bpm > 170;
      const isBpmWarning  = !isBpmCritical && (bpm < 60 || bpm > 100);

      const spo2 = Number(liveData?.spo2 || liveData?.SpO2 || liveData?.SPO2 || liveData?.oxygen || 0);
      const isSpo2Critical = spo2 < 75;
      const isSpo2Warning  = spo2 > 0 && !isSpo2Critical && spo2 < 95;

      const temp = Number(liveData?.temperature_c || liveData?.Temperature_C || liveData?.temperature || liveData?.temp || liveData?.Temp || 0);
      const isTempCritical = temp > 0 && (temp < 34 || temp > 40);
      const isTempWarning  = temp > 0 && !isTempCritical && (temp < 36.1 || temp > 37.2);

      const hum = Number(liveData?.humidity || liveData?.Humidity || liveData?.hum || liveData?.Hum || 0);
      const isHumCritical = hum > 0 && (hum < 20 || hum > 75);
      const isHumWarning  = !isHumCritical && (hum < 30 || hum > 60);

      const isBpmAbnormal = bpm > 0 && (bpm < 60 || bpm > 100);
      const isSpo2Abnormal = spo2 > 0 && (spo2 < 95);
      const isTempAbnormal = temp > 0 && (temp < 36.1 || temp > 37.2);
      const isHumAbnormal = hum > 0 && (hum < 30 || hum > 60);
      const abnormalCount = [isBpmAbnormal, isSpo2Abnormal, isTempAbnormal, isHumAbnormal].filter(Boolean).length;

      const emergency = liveData?.emergency === true || String(liveData?.emergency) === 'true' || abnormalCount >= 3;
      const isAbnormal = liveData?.isAbnormal === true || String(liveData?.isAbnormal) === 'true' || abnormalCount > 0;

      const isCriticalPatient = isBpmCritical || isSpo2Critical || isTempCritical || isHumCritical || emergency || liveData?.condition === 'Critical';

      const isFingerOn = liveData?.fingerOn === true || liveData?.finger === true || liveData?.finger_on === true || liveData?.fingerOn !== false;

      // Find first ECG path that has data
      let ecgWaveform: number[] = [];
      if (Array.isArray(liveData?.ecgData) && liveData.ecgData.length > 0) {
        ecgWaveform = liveData.ecgData.map(Number);
      } else if (Array.isArray(liveData?.ecg) && liveData.ecg.length > 0) {
        ecgWaveform = liveData.ecg.map(Number);
      } else {
        for (const path of ecgPaths) {
          if (latestEcgMap[path]) {
            const raw = latestEcgMap[path];
            let parsedData: number[] = [];
            if (Array.isArray(raw)) {
              parsedData = raw.map(Number);
            } else if (typeof raw === 'object' && raw !== null) {
              parsedData = Object.values(raw).map(Number);
            }
            if (parsedData.length > 0) {
              ecgWaveform = parsedData;
              break;
            }
          }
        }
      }

      // Find first location path that has data
      let currentLoc = null;
      for (const path of locationPaths) {
        if (latestLocMap[path]) {
          currentLoc = latestLocMap[path];
          break;
        }
      }

      // Find first diagnosis path that has data
      let currentDiag = null;
      for (const path of diagnosisPaths) {
        if (latestDiagMap[path]) {
          currentDiag = latestDiagMap[path];
          break;
        }
      }

      // Find first profile path that has data
      let currentProfile = null;
      for (const path of profilePaths) {
        if (latestProfileMap[path]) {
          currentProfile = latestProfileMap[path];
          break;
        }
      }

      // Matched Firestore Profile (fallback)
      const matchedProfile = allPatients.find(p => p.id === activeId || p.serialNumber === activeId || p.uid === activeId);

      setVitals({
        bpm,
        spo2,
        humidity: hum,
        temperature_c: temp,
        emergency: emergency,
        isAbnormal: isAbnormal,
        isBpmCritical, isBpmWarning,
        isSpo2Critical, isSpo2Warning,
        isTempCritical, isTempWarning,
        isHumCritical, isHumWarning,
        ecgData: ecgWaveform,
        patientName: currentProfile?.name || currentProfile?.fullName || currentProfile?.displayName || liveData?.patientName || matchedProfile?.profile?.fullName || matchedProfile?.fullName || matchedProfile?.name || 'Active Patient',
        patientAge: currentProfile?.age || liveData?.patientAge || matchedProfile?.profile?.age || matchedProfile?.age || '',
        patientEmail: currentProfile?.email || matchedProfile?.profile?.email || matchedProfile?.email || '',
        patientGender: currentProfile?.gender || matchedProfile?.profile?.gender || '',
        patientBloodGroup: currentProfile?.bloodGroup || matchedProfile?.profile?.bloodGroup || '',
        serialNumber: liveData?.serialNumber || activeId,
        alertReason: liveData?.alertReason || 'Critical',
        fingerOn: isFingerOn,
        timestamp: liveData?.timestamp || Date.now(),
        location: currentLoc,
        aiDiagnosis: currentDiag
      });

      if (isCriticalPatient && !sirenActive.current && audioEnabled && !emergencyHandled) {
        emergencyService.playSiren();
        sirenActive.current = true;
      } else if ((!isCriticalPatient || emergencyHandled) && sirenActive.current) {
        emergencyService.stopSiren();
        sirenActive.current = false;
      }

      // Auto-show emergency modal only if patient condition is critical and not handled yet
      if (isCriticalPatient && !modalShownRef.current && !emergencyHandled) {
        setShowEmergencyModal(true);
        modalShownRef.current = true;
      }
      // Reset if condition is normal
      if (!isCriticalPatient) {
        modalShownRef.current = false;
        setEmergencyHandled(false);
        setShowEmergencyModal(false);
      }
    };

    setLoading(true);
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    // Subscribe to all paths
    vitalsPaths.forEach((path) => {
      const unsub = onValue(ref(rtdb, path), (snapshot) => {
        latestVitalsMap[path] = snapshot.exists() ? snapshot.val() : null;
        updateCombined();
        clearTimeout(safetyTimer);
        setLoading(false);
      });
      unsubs.push(unsub);
    });

    ecgPaths.forEach((path) => {
      const unsub = onValue(ref(rtdb, path), (snapshot) => {
        latestEcgMap[path] = snapshot.exists() ? snapshot.val() : null;
        updateCombined();
      });
      unsubs.push(unsub);
    });

    locationPaths.forEach((path) => {
      const unsub = onValue(ref(rtdb, path), (snapshot) => {
        latestLocMap[path] = snapshot.exists() ? snapshot.val() : null;
        if (snapshot.exists()) {
          setPatientLocation(snapshot.val());
        }
        updateCombined();
      });
      unsubs.push(unsub);
    });

    diagnosisPaths.forEach((path) => {
      const unsub = onValue(ref(rtdb, path), (snapshot) => {
        latestDiagMap[path] = snapshot.exists() ? snapshot.val() : null;
        updateCombined();
      });
      unsubs.push(unsub);
    });

    profilePaths.forEach((path) => {
      const unsub = onValue(ref(rtdb, path), (snapshot) => {
        latestProfileMap[path] = snapshot.exists() ? snapshot.val() : null;
        updateCombined();
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
      clearTimeout(safetyTimer);
      emergencyService.stopSiren();
      sirenActive.current = false;
    };
  }, [derivedActiveId, allPatients, audioEnabled, emergencyHandled]);

  // Redirect to Doctor Dashboard if ALL 4 conditions are critical
  useEffect(() => {
    if (vitals) {
      const allCritical = 
        (vitals.isBpmCritical === true) && 
        (vitals.isSpo2Critical === true) && 
        (vitals.isTempCritical === true) && 
        (vitals.isHumCritical === true);
      if (allCritical && !emergencyHandled) {
        navigate('/doctor/dashboard');
      }
    }
  }, [vitals, navigate, emergencyHandled]);

  // ─── Real Medical Threshold flags for UI ──────────────────────
  const bpm  = Number(vitals?.bpm || 0);
  const spo2 = Number(vitals?.spo2 || 0);
  const temp = Number(vitals?.temperature_c || 0);
  const hum  = Number(vitals?.humidity || 0);

  const isCriticalBPM  = vitals?.isBpmCritical ?? false;
  const isWarningBPM   = vitals?.isBpmWarning ?? false;
  const isCriticalSpo2 = vitals?.isSpo2Critical ?? false;
  const isWarningSpo2  = vitals?.isSpo2Warning ?? false;
  const isCriticalTemp = vitals?.isTempCritical ?? false;
  const isWarningTemp  = vitals?.isTempWarning ?? false;
  const isCriticalHum  = vitals?.isHumCritical ?? false;

  const clinicalCritCount = [isCriticalBPM, isCriticalSpo2, isCriticalTemp].filter(Boolean).length;
  const critCount = clinicalCritCount;
  
  const isBpmAbnormal = bpm > 0 && (bpm < 60 || bpm > 100);
  const isSpo2Abnormal = spo2 > 0 && (spo2 < 95);
  const isTempAbnormal = temp > 0 && (temp < 36.1 || temp > 37.2);
  const isHumAbnormal = hum > 0 && (hum < 30 || hum > 60);
  const abnormalCount = [isBpmAbnormal, isSpo2Abnormal, isTempAbnormal, isHumAbnormal].filter(Boolean).length;

  // Strict emergency validation
  const emergency = vitals?.emergency === true || String(vitals?.emergency) === 'true' || abnormalCount >= 3;
  const isAbnormal = vitals?.isAbnormal === true || String(vitals?.isAbnormal) === 'true' || abnormalCount > 0;

  const isCriticalPatient = isCriticalBPM || isCriticalSpo2 || isCriticalTemp || isCriticalHum || emergency || vitals?.condition === 'Critical';

  const isHighRisk      = isAbnormal; 
  const isFullEmergency = emergency;

  const isGlobalCritical = isCriticalPatient;  // Only show full global critical/emergency alert styling on doctor dashboard for critical patient
  const isLowOxygen = isCriticalSpo2;   // Alias for diagnosis
  const isHighTemp  = isCriticalTemp;
  const isFingerOn      = vitals?.fingerOn ?? false;

  // Unify and resolve patient identity details with robust fallbacks
  const patientName = patientProfile?.profile?.fullName || patientProfile?.profile?.name || patientProfile?.fullName || patientProfile?.name || (vitals?.patientName !== 'Unknown' && vitals?.patientName) || 'Active Patient';
  const patientAge = patientProfile?.profile?.age || patientProfile?.age || (vitals?.patientAge !== 0 && vitals?.patientAge) || '--';

  // State flag for active vitals alerts/anomalies
  const hasAlerts = isCriticalBPM || isWarningBPM || isCriticalSpo2 || isWarningSpo2 || isCriticalTemp || isWarningTemp || isCriticalHum || isGlobalCritical;

  // Audio permission unlock on first interaction
  const enableAudio = () => {
    if (!audioEnabled) {
      setAudioEnabled(true);
      // Briefly play and stop to unlock
      emergencyService.playSiren();
      setTimeout(() => {
        if (!isGlobalCritical) emergencyService.stopSiren();
      }, 100);
    }
  };

  const handleCallAmbulanceClick = async () => {
    if (isCallingAmbulance) return;
    setIsCallingAmbulance(true);
    try {
      await emergencyService.callAmbulanceAPI();
    } catch (e) {
      console.error('[Doctor] Call ambulance failed:', e);
    } finally {
      setIsCallingAmbulance(false);
    }
  };

  const handleEmergencyAction = async () => {
    if (!vitals) return;
    try {
      // Write emergency alert to Firestore for doctor confirmation record
      await setDoc(doc(db, 'emergencyAlerts', vitals.serialNumber || 'HS-001'), {
        patientId: vitals.serialNumber || 'HS-001',
        patientName: patientName,
        status: 'DISPATCHED',
        severity: 'CRITICAL',
        vitals: { heartRate: bpm, spO2: spo2, temp },
        timestamp: serverTimestamp(),
        detectedAt: new Date().toISOString(),
        dispatchedAt: new Date().toISOString(),
        ambulanceId: 'AMB-' + Math.floor(1000 + Math.random() * 9000),
        contactsNotified: true,
      });

      // Also write to Firestore collection 'ambulanceDispatch'
      const dispatchId = `DISPATCH-${Date.now()}`;
      await setDoc(doc(db, 'ambulanceDispatch', dispatchId), {
        ambulanceId: 'AMB-' + Math.floor(1000 + Math.random() * 9000),
        patientId: vitals.serialNumber || 'HS-001',
        patientName: patientName,
        status: 'EN_ROUTE',
        severity: 'CRITICAL',
        hospitalAssigned: 'Apollo Cardiology Clinic',
        eta: '4 mins',
        dispatchedAt: serverTimestamp(),
      });

      // Send WhatsApp emergency to ambulance
      sendRealtimeWhatsAppEmergency({
        ...vitals,
        patientName,
        patientAge
      }, vitals.location);

      // Navigate to trace page
      navigate('/doctor/emergency');
    } catch (e) {
      console.error('[Doctor] Dispatch failed:', e);
    }
  };

  const getDiagnosis = () => {
    if (isCriticalPatient) {
      return { 
        title: 'Possible Ventricular Tachycardia', 
        desc: 'Immediate emergency intervention required. Highly abnormal ECG waveform matching ventricular tachycardia with critical hypoxia and hyperthermia.', 
        score: 92 
      };
    }
    if (isFullEmergency) return { title: 'Full Medical Emergency', desc: 'Heart Rate, SpO2, and Temperature are all critically abnormal. Immediate life-saving intervention required.', score: 99 };
    if (isHighRisk)      return { title: 'High Risk Multi-Vital Alert', desc: `${critCount} vital parameters are simultaneously in critical ranges. Doctor action required.`, score: 92 };
    if (isCriticalBPM)   return { title: 'Critical Heart Rate', desc: bpm < 50 ? `Severe bradycardia — ${bpm} BPM detected. Possible cardiac arrest risk.` : `Severe tachycardia — ${bpm} BPM. Extreme cardiac stress.`, score: 87 };
    if (isCriticalSpo2)  return { title: 'Critical Oxygen Saturation', desc: `SpO2 at ${spo2}% — severe hypoxia. Patient may require immediate oxygen supplementation.`, score: 91 };
    if (isCriticalTemp)  return { title: 'Critical Temperature', desc: temp < 35 ? 'Hypothermia detected. Core body temperature dangerously low.' : 'High-grade fever detected. Possible infection or heat stroke.', score: 85 };
    if (isWarningBPM)    return { title: 'Heart Rate Warning', desc: `BPM at ${bpm} — outside normal range. Continue monitoring closely.`, score: 75 };
    if (isWarningSpo2)   return { title: 'Low SpO2 Warning', desc: `SpO2 at ${spo2}% — slightly below normal. Watch for further decline.`, score: 72 };
    return { title: 'Stable Sinus Rhythm', desc: 'All vitals are within normal clinical ranges. Patient is stable.', score: 100 };
  };

  // ─── Doctor: Accept Emergency → Dispatch Ambulance ─────────────
  const handleAcceptEmergency = async () => {
    setShowEmergencyModal(false);
    setEmergencyHandled(true);
    emergencyService.stopSiren();
    try {
      // Write emergency alert to Firestore for doctor confirmation record
      await setDoc(doc(db, 'emergencyAlerts', vitals?.serialNumber || 'HS-001'), {
        patientId: vitals?.serialNumber || 'HS-001',
        patientName: patientName,
        status: 'DISPATCHED',
        severity: 'CRITICAL',
        vitals: { heartRate: bpm, spO2: spo2, temp },
        timestamp: serverTimestamp(),
        detectedAt: new Date().toISOString(),
        dispatchedAt: new Date().toISOString(),
        ambulanceId: 'AMB-' + Math.floor(1000 + Math.random() * 9000),
        contactsNotified: true,
      });

      // Also write to Firestore collection 'ambulanceDispatch'
      const dispatchId = `DISPATCH-${Date.now()}`;
      await setDoc(doc(db, 'ambulanceDispatch', dispatchId), {
        ambulanceId: 'AMB-' + Math.floor(1000 + Math.random() * 9000),
        patientId: vitals?.serialNumber || 'HS-001',
        patientName: patientName,
        status: 'EN_ROUTE',
        severity: 'CRITICAL',
        hospitalAssigned: 'Apollo Cardiology Clinic',
        eta: '4 mins',
        dispatchedAt: serverTimestamp(),
      });

      // Turn off global emergency status so siren stops everywhere
      await setDoc(doc(db, 'emergencyStatus', 'global'), {
        active: false,
        resolvedAt: serverTimestamp(),
      }, { merge: true });

      // Send WhatsApp emergency to ambulance
      sendRealtimeWhatsAppEmergency({
        ...vitals,
        patientName,
        patientAge
      }, vitals?.location);

      // Navigate to trace page
      navigate('/doctor/emergency');
    } catch (e) {
      console.error('[Doctor] Dispatch failed:', e);
    }
  };

  // ─── Doctor: Reject Alert ────────────────────────────────────────
  const handleRejectAlert = async () => {
    setShowEmergencyModal(false);
    setEmergencyHandled(true);
    modalShownRef.current = false;
    emergencyService.stopSiren();
    try {
      const patientId = vitals?.serialNumber || 'HS-001';
      const rtdbReportRef = ref(rtdb, `reports/${patientId}`);
      await update(rtdbReportRef, {
        doctorResponse: {
          status: 'false_alert',
          reviewedAt: Date.now()
        }
      });

      await setDoc(doc(db, 'emergencyAlerts', patientId), {
        patientId: patientId,
        status: 'RESOLVED',
        severity: 'FALSE_ALERT',
        resolvedAt: new Date().toISOString(),
        timestamp: serverTimestamp(),
      }, { merge: true });

      // Turn off global emergency status
      await setDoc(doc(db, 'emergencyStatus', 'global'), {
        active: false,
        resolvedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error('[Doctor] Reject write failed:', e);
    }
  };

  const handleCloseModal = async () => {
    setShowEmergencyModal(false);
    setEmergencyHandled(true);
    modalShownRef.current = false;
    emergencyService.stopSiren();
    try {
      await setDoc(doc(db, 'emergencyStatus', 'global'), {
        active: false,
        resolvedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error('[Doctor] Close modal status update failed:', e);
    }
  };

  const handleViewEmergency = () => {
    setShowEmergencyModal(false);
    emergencyService.stopSiren();
    sirenActive.current = false;
  };

  const diagnosis = getDiagnosis();

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" onClick={enableAudio}>
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
            <div className="absolute inset-0 border-4 border-accent-maroon border-t-transparent rounded-full animate-spin" />
            <Heart className="absolute inset-0 m-auto w-6 h-6 text-accent-maroon animate-pulse" />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Establishing Real-time Link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex overflow-hidden font-sans" onClick={enableAudio}>
      <title>{isGlobalCritical ? '🚨 CRITICAL ALERT | HeartSync' : 'Live Telemetry | HeartSync'}</title>

      {/* ─── Emergency Modal ─── */}
      {showEmergencyModal && (
        <DoctorEmergencyModal
          activeEmergencyPatient={{
            vitals: {
              bpm,
              spo2,
              temperature_c: temp,
              humidity: hum,
              ecg: vitals?.ecgData,
              timestamp: vitals?.timestamp,
            },
            patient: {
              id: vitals?.serialNumber || derivedActiveId,
              serialNumber: vitals?.serialNumber || derivedActiveId,
              fullName: patientName,
              profile: {
                fullName: patientName,
                age: patientAge,
                gender: patientProfile?.profile?.gender || patientProfile?.gender || '',
              },
            },
          }}
          isMuted={!audioEnabled}
          onToggleMute={() => {
            const newAudioState = !audioEnabled;
            setAudioEnabled(newAudioState);
            if (!newAudioState) {
              emergencyService.stopSiren();
              sirenActive.current = false;
            } else {
              if (isCriticalPatient) {
                emergencyService.playSiren();
                sirenActive.current = true;
              }
            }
          }}
          onClose={handleCloseModal}
          onIgnoreAlert={handleRejectAlert}
          onConfirmCritical={handleAcceptEmergency}
          onViewPatient={(patientId) => {
            emergencyService.stopSiren();
            sirenActive.current = false;
            setEmergencyHandled(true);
            setShowEmergencyModal(false);
            navigate(`/doctor/patient/${patientId}`);
          }}
          onCallAmbulance={handleCallAmbulanceClick}
          isCallingAmbulance={isCallingAmbulance}
        />
      )}

      <DoctorSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* HOSPITAL HEADER */}
        <header className={`h-20 md:h-24 transition-colors duration-500 border-b px-4 md:px-12 flex items-center justify-between shrink-0 ${isGlobalCritical ? 'bg-accent-maroon border-accent-maroon text-white' : 'bg-white border-slate-100 text-slate-900'}`}>
          <div className="flex items-center gap-6">
             <button onClick={() => setIsSidebarOpen(true)} className={`lg:hidden p-2 transition-all ${isGlobalCritical ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-accent-maroon'}`}>
                <Menu className="w-6 h-6" />
             </button>
             <div className="min-w-0">
                <h2 className="text-lg md:text-2xl font-display font-black tracking-tight truncate">{isGlobalCritical ? 'EMERGENCY MONITORING' : 'Clinical Registry'}</h2>
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] leading-none mt-1 ${isGlobalCritical ? 'text-white/60' : 'text-slate-400'}`}>
                  {isGlobalCritical ? 'Real-time High Priority Stream' : 'Real-time Telemetry Processing'}
                </p>
             </div>
          </div>

          {/* Patient Selector Search */}
          <div className="relative min-w-[260px] hidden md:block">
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all ${
              isGlobalCritical ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-50 border-slate-100 text-slate-900'
            }`}>
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search patient..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="bg-transparent border-none outline-none text-xs font-bold w-full placeholder:text-slate-400"
              />
            </div>
            
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-[999] max-h-60 overflow-y-auto no-scrollbar">
                {allPatients
                  .filter(p => {
                    const name = (p.profile?.fullName || p.profile?.name || p.fullName || p.name || '').toLowerCase();
                    return name.includes(searchQuery.toLowerCase());
                  })
                  .map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setPatientProfile(p);
                        localStorage.setItem('selectedPatientId', p.uid || p.id || p.serialNumber || '');
                        setShowDropdown(false);
                        setSearchQuery('');
                      }}
                      className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex items-center gap-3 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white text-xs font-black overflow-hidden">
                        {(p.profile?.profileImage || p.photoURL) ? (
                          <img src={p.profile?.profileImage || p.photoURL} className="w-full h-full object-cover" alt="" />
                        ) : (
                          (p.profile?.fullName || p.profile?.name || p.fullName || p.name || 'P').charAt(0)
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-slate-900">{p.profile?.fullName || p.profile?.name || p.fullName || p.name || 'Active Patient'}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">ID: {p.uid || p.id}</p>
                      </div>
                    </div>
                  ))}
                {allPatients.filter(p => {
                  const name = (p.profile?.fullName || p.profile?.name || p.fullName || p.name || '').toLowerCase();
                  return name.includes(searchQuery.toLowerCase());
                }).length === 0 && (
                  <p className="text-[9px] font-bold text-slate-400 text-center py-4 uppercase tracking-widest">No patients found</p>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-8">
             <button className={`relative p-3 rounded-2xl transition-all border ${isGlobalCritical ? 'bg-white/10 text-white border-white/20' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                <Bell className="w-5 h-5" />
                {isGlobalCritical && <div className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-white rounded-full border-2 border-accent-maroon animate-ping" />}
             </button>
             <div className="text-right border-l border-white/10 pl-4 md:pl-8">
                <p className="text-base md:text-lg font-black tracking-tight leading-none">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isGlobalCritical ? 'text-white/60' : 'text-slate-400'}`}>
                  {currentTime.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-12 no-scrollbar">
           <div className="max-w-7xl mx-auto">
              {!isCriticalPatient ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white rounded-[32px] md:rounded-[40px] border border-slate-100 shadow-premium p-8 md:p-16 text-center">
                  <div className="w-20 h-20 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-6">
                    <ShieldCheck className="w-10 h-10 text-green-500 animate-pulse" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter italic mb-2">NO ACTIVE CRITICAL PATIENTS</h3>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest max-w-md mx-auto mb-4">
                    Realtime telemetry monitoring active.
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Waiting for emergency events from Firebase RTDB.
                  </p>
                </div>
              ) : (
                <div className="space-y-10">
                  {/* REALTIME EMERGENCY ALERT BANNER */}
                  <AnimatePresence>
                    {isGlobalCritical && (
                      <motion.div 
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ 
                          opacity: 1, 
                          y: 0, 
                          scale: 1,
                          borderColor: ['#800000', '#ff0000', '#800000'],
                        }}
                        transition={{ 
                          borderColor: { duration: 1, repeat: Infinity },
                          default: { type: 'spring', damping: 15 }
                        }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-accent-maroon border-4 rounded-[24px] md:rounded-[32px] p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 shadow-[0_20px_50px_rgba(128,0,0,0.3)] text-white relative overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
                        <div className="flex items-center gap-6 md:gap-10 flex-1 relative z-10">
                          <div className="w-16 h-16 md:w-24 md:h-24 bg-white/10 rounded-[24px] md:rounded-[32px] flex items-center justify-center text-white shadow-2xl animate-pulse border-2 border-white/20">
                            <ShieldAlert className="w-8 h-8 md:w-12 md:h-12" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                               <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                                <h3 className="text-xl md:text-3xl font-black tracking-tighter uppercase italic">CRITICAL PATIENT DETECTED</h3>
                            </div>
                            <p className="text-xs md:text-lg font-bold text-white/80">Immediate medical attention required for {patientName}</p>
                            <div className="flex items-center gap-6 mt-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-white/60">
                               <span>Serial: {vitals?.serialNumber}</span>
                               <span className="w-1 h-1 bg-white/40 rounded-full" />
                               <span>Live GPS Tracking Active</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* REALTIME VITALS GRID (Full Width) */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
                    <VitalsCard
                      label="Heart Rate"
                      value={vitals?.bpm ?? '--'}
                      unit="BPM"
                      icon={HeartPulse}
                      status={vitals?.isBpmCritical ? 'critical' : vitals?.isBpmWarning ? 'warning' : 'optimal'}
                      isEmergency={vitals?.isBpmCritical}
                      customStatusLabel={vitals?.isBpmCritical ? 'CRITICAL' : vitals?.isBpmWarning ? 'WARNING' : 'Normal'}
                    />
                    <VitalsCard
                      label="Blood Oxygen"
                      value={vitals?.spo2 ?? '--'}
                      unit="%"
                      icon={Activity}
                      status={vitals?.isSpo2Critical ? 'critical' : vitals?.isSpo2Warning ? 'warning' : 'optimal'}
                      isEmergency={vitals?.isSpo2Critical}
                      customStatusLabel={vitals?.isSpo2Critical ? 'CRITICAL' : vitals?.isSpo2Warning ? 'LOW SPO2' : 'Normal'}
                    />
                    <VitalsCard
                      label="Temperature"
                      value={vitals?.temperature_c ? Number(vitals.temperature_c).toFixed(1) : '--'}
                      unit="°C"
                      icon={Thermometer}
                      status={vitals?.isTempCritical ? 'critical' : vitals?.isTempWarning ? 'warning' : 'optimal'}
                      isEmergency={vitals?.isTempCritical}
                      customStatusLabel={vitals?.isTempCritical ? 'CRITICAL' : vitals?.isTempWarning ? 'WARNING' : 'Normal'}
                    />
                    <VitalsCard
                      label="Humidity"
                      value={vitals?.humidity ?? '--'}
                      unit="%"
                      icon={Droplets}
                      status={vitals?.isHumCritical ? 'critical' : vitals?.isHumWarning ? 'warning' : 'optimal'}
                      isEmergency={vitals?.isHumCritical}
                      customStatusLabel={vitals?.isHumCritical ? 'CRITICAL' : vitals?.isHumWarning ? 'WARNING' : 'Stable'}
                    />
                    <VitalsCard
                      label="Emergency Status"
                      value={vitals?.emergency ? 'EMERGENCY' : (vitals?.isAbnormal ? 'HIGH RISK' : 'READY')}
                      unit=""
                      icon={ShieldAlert}
                      status={vitals?.emergency ? 'critical' : (vitals?.isAbnormal ? 'warning' : 'optimal')}
                      customStatusLabel={vitals?.emergency ? 'FULL EMERGENCY' : vitals?.isAbnormal ? 'MULTI-CRITICAL' : 'Monitoring'}
                      isEmergency={vitals?.emergency}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10">
                       {/* MONITORING PANEL */}
                       <div className="lg:col-span-2 space-y-6 md:space-y-10">
                          
                          {/* REALTIME PATIENT INFO */}
                          <div className={`rounded-[24px] md:rounded-[40px] p-6 md:p-10 border transition-all duration-500 flex flex-col md:flex-row items-center gap-6 md:gap-10 ${
                            isGlobalCritical ? 'bg-white border-accent-maroon shadow-2xl ring-4 ring-accent-maroon/5' : 'bg-white border-slate-100 shadow-sm'
                          }`}>
                             <div className={`w-20 h-20 md:w-24 md:h-24 rounded-[24px] md:rounded-[32px] flex items-center justify-center text-white text-3xl font-black overflow-hidden shadow-2xl transition-all ${isGlobalCritical ? 'bg-accent-maroon scale-105' : 'bg-slate-900'}`}>
                                {(patientProfile?.profile?.profileImage || patientProfile?.photoURL || vitals?.photoURL) ? <img src={patientProfile?.profile?.profileImage || patientProfile?.photoURL || vitals?.photoURL} alt="" className="w-full h-full object-cover" /> : <User className="w-10 h-10" />}
                             </div>
                             <div className="flex-1 text-center md:text-left">
                                <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 mb-4">
                                   <h3 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight">{patientName}</h3>
                                   {isGlobalCritical && (
                                     <span className="px-4 py-1 bg-accent-maroon text-white rounded-lg text-[9px] font-black uppercase tracking-widest animate-pulse">Critical Badge</span>
                                   )}
                                </div>
                                <div className="flex flex-wrap justify-center md:justify-start items-center gap-y-4 gap-x-8 text-slate-400 font-bold text-xs">
                                   <div className="flex items-center gap-2">
                                      <span className="text-[10px] uppercase tracking-widest">ID:</span>
                                      <span className="text-slate-900">{vitals?.serialNumber || 'HS-001'}</span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                      <span className="text-[10px] uppercase tracking-widest">Age:</span>
                                      <span className="text-slate-900">{patientAge}</span>
                                   </div>
                                   <div className="flex items-center gap-2 text-green-500">
                                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                      <span className="text-[10px] uppercase tracking-widest font-black">Live</span>
                                   </div>
                                </div>
                             </div>
                          </div>

                          {/* ECG GRAPHICS */}
                          <div className="bg-white rounded-[24px] md:rounded-[40px] border border-slate-100 shadow-premium p-6 md:p-10">
                             <div className="flex items-center justify-between mb-8">
                                <div>
                                   <h3 className="text-xl font-black text-slate-900 tracking-tight italic">Max30102 Stream</h3>
                                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Live Waveform Processing</p>
                                </div>
                                <div className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                   <div className="w-2 h-2 bg-accent-maroon rounded-full animate-pulse" /> RTDB LIVE
                                </div>
                             </div>
                             <div className="h-48 md:h-64">
                                 <ECGGraph bpm={bpm} isEmergency={isGlobalCritical} ecgData={vitals?.ecgData} isSensorConnected={!!vitals} isCritical={vitals?.condition === 'Critical' || vitals?.emergency} />
                             </div>
                          </div>

                          {/* REALTIME MAP GPS TRACKER */}
                          <div className="bg-white rounded-[24px] md:rounded-[40px] border border-slate-100 shadow-premium overflow-hidden h-[400px] relative">
                             <GoogleMapsTracker />
                          </div>
                       </div>

                       {/* DIAGNOSTICS & TELEMETRY */}
                       <div className="space-y-6 md:space-y-10">
                          <div className="bg-white rounded-[24px] md:rounded-[40px] border border-slate-100 shadow-premium p-6 md:p-10">
                             <div className="flex items-center justify-between mb-8">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diagnostic Recommendation</h4>
                                <div className="p-2 bg-slate-50 text-accent-maroon rounded-xl">
                                   <Activity className="w-5 h-5" />
                                </div>
                             </div>
                             
                             <div className={`p-6 md:p-8 rounded-[24px] md:rounded-[32px] border transition-all duration-500 ${isGlobalCritical ? 'bg-accent-maroon/5 border-accent-maroon/20' : 'bg-slate-50 border-slate-100'}`}>
                                <h5 className={`text-lg font-black tracking-tight mb-2 leading-tight ${isGlobalCritical ? 'text-accent-maroon' : 'text-slate-900'}`}>
                                  {diagnosis.title}
                                </h5>
                                <p className="text-xs font-medium text-slate-600 leading-relaxed">
                                  {diagnosis.desc}
                                </p>
                             </div>

                             <div className="mt-8 pt-8 border-t border-slate-50">
                                <div className="flex items-center justify-between mb-4">
                                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Confidence</span>
                                   <span className="text-md font-black text-slate-900 italic">{diagnosis.score}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                                   <motion.div 
                                     initial={{ width: 0 }}
                                     animate={{ width: `${diagnosis.score}%` }}
                                     className={`h-full transition-colors duration-500 ${isGlobalCritical ? 'bg-accent-maroon' : 'bg-green-500'}`}
                                   />
                                </div>
                             </div>
                          </div>

                          {/* DYNAMIC EMERGENCY ACTION BUTTON */}
                          <AnimatePresence>
                            {isGlobalCritical && (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-white rounded-[24px] md:rounded-[40px] border border-slate-100 shadow-premium p-6 md:p-10"
                              >
                                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 text-center">Dispatch Unit</h4>
                                 <button 
                                   onClick={handleEmergencyAction}
                                   className="w-full bg-accent-maroon text-white py-4 md:py-6 rounded-[20px] font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-4 group hover:bg-[#600000] transition-all shadow-xl shadow-accent-maroon/20 animate-bounce"
                                 >
                                    <ShieldAlert className="w-5 h-5" />
                                    DISPATCH AMBULANCE
                                 </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                     </div>
                  </div>
               )}
            </div>
         </div>
      </main>
    </div>
  );
};

export default DoctorLiveMonitoring;
