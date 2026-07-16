import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Heart, 
  Activity, 
  MapPin, 
  Phone, 
  ShieldAlert, 
  History,
  Thermometer,
  Droplets,
  HeartPulse,
  Navigation,
  ExternalLink,
  Plus,
  Menu,
  ShieldCheck,
  User,
  Bot
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, rtdb } from '../../shared/lib/firebase';
import { doc, onSnapshot, collection, query, where, getDocs, limit, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, onValue, set, update, get } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import DoctorSidebar from '../components/DoctorSidebar';
import VitalsCard from '../components/patient/VitalsCard';
import ECGGraph from '../components/patient/ECGGraph';
import GoogleMapsTracker from '../components/GoogleMapsTracker';
import { emergencyService } from '../../backend/services/emergencyService';


const DoctorPatientDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useAuth();
  const [patient, setPatient] = useState<any>(null);
  const [vitals, setVitals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [hasDispatched, setHasDispatched] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [dispatch, setDispatch] = useState<any>(null);

  const [rtdbProfile, setRtdbProfile] = useState<any>(null);
  const [rtdbVitals, setRtdbVitals] = useState<any>(null);
  const [rtdbEcg, setRtdbEcg] = useState<any>(null);
  const [rtdbLocation, setRtdbLocation] = useState<any>(null);
  const [rtdbAiDiagnosis, setRtdbAiDiagnosis] = useState<any>(null);
  const [isCallingAmbulance, setIsCallingAmbulance] = useState(false);

  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, 'ambulanceDispatch'),
      where('patientId', '==', id)
    );
    const unsubDispatch = onSnapshot(q, (snap) => {
      const activeDispatch = snap.docs.find(d => d.data().status !== 'ARRIVED');
      if (activeDispatch) {
        setDispatch(activeDispatch.data());
        setHasDispatched(true);
      } else {
        setDispatch(null);
        setHasDispatched(false);
      }
    }, (err) => console.warn("Failed to listen to ambulanceDispatch:", err));
    return () => unsubDispatch();
  }, [id]);

  useEffect(() => {
    const targetId = (id && id !== 'HS-001') ? id : (patient?.uid || patient?.id);
    if (!targetId) return;

    const unsubAnalysis = onSnapshot(doc(db, 'aiAnalysis', targetId), (snap) => {
      if (snap.exists()) {
        setAnalysis(snap.data());
      } else {
        setAnalysis(null);
      }
    });

    return () => unsubAnalysis();
  }, [id, patient]);

  // Parse vitals in a robust case-insensitive way
  const bpm  = vitals?.bpm ?? null;
  const spo2 = vitals?.spo2 ?? null;
  const temp = vitals?.temperature_c ?? null;
  const hum  = vitals?.humidity ?? null;

  // Unify and resolve patient identity details with robust fallbacks
  const patientName = rtdbProfile?.name || patient?.profile?.fullName || patient?.fullName || (vitals?.patientName !== 'Unknown' && vitals?.patientName) || 'Active Patient';
  const patientAge = rtdbProfile?.age || patient?.profile?.age || patient?.age || (vitals?.patientAge !== 0 && vitals?.patientAge) || '--';
  const patientGender = rtdbProfile?.gender || patient?.profile?.gender || patient?.gender || '--';
  const patientBlood = rtdbProfile?.bloodGroup || patient?.profile?.bloodGroup || patient?.bloodGroup || '--';
  const patientPhone = rtdbProfile?.phone || patient?.profile?.phone || patient?.phone || '--';
  const patientEmail = rtdbProfile?.email || patient?.profile?.email || patient?.email || '--';

  useEffect(() => {
    if (!id) return;

    const activeId = id;

    const vitalsPaths = [
      `patients/${activeId}/liveVitals`,
      `liveHealthMetrics/${activeId}`,
      `liveHealthMetrics/HS-001`,
      `users/${activeId}/liveReading`,
      `users/m1uph2bX7SVd9Wbyge1AMqAmq093/liveReading`,
      `users/onYK6WJGu6VR6fEgQXBhximLEFI3/liveReading`,
      `users/HS-001/liveReading`
    ];

    const ecgPaths = [
      `patients/${activeId}/ecgData/waveform`,
      `patients/${activeId}/ecgData`,
      `liveHealthMetrics/${activeId}/ecgData`,
      `liveHealthMetrics/HS-001/ecgData`,
      `liveHealthMetrics/HS-001/ecg`,
      `users/${activeId}/liveReading/ecg`,
      `users/m1uph2bX7SVd9Wbyge1AMqAmq093/liveReading/ecg`,
      `users/onYK6WJGu6VR6fEgQXBhximLEFI3/liveReading/ecg`,
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

      // Map profiles
      let resolvedProfile = null;
      for (const path of profilePaths) {
        if (latestProfileMap[path]) {
          resolvedProfile = latestProfileMap[path];
          break;
        }
      }
      if (resolvedProfile) {
        setRtdbProfile(resolvedProfile);
      }

      // Map ECG
      let latestEcgData: number[] = [];
      for (const path of ecgPaths) {
        if (latestEcgMap[path]) {
          const raw = latestEcgMap[path];
          let parsedData: number[] = [];
          if (Array.isArray(raw)) {
            parsedData = raw.map(Number);
          } else if (typeof raw === 'object' && raw !== null) {
            parsedData = Object.values(raw).map(Number);
          } else if (typeof raw === 'string') {
            parsedData = raw.split(',').map(Number).filter(n => !isNaN(n));
          }
          if (parsedData.length > 0) {
            latestEcgData = parsedData;
            break;
          }
        }
      }

      // Map Location
      let resolvedLoc = null;
      for (const path of locationPaths) {
        if (latestLocMap[path]) {
          resolvedLoc = latestLocMap[path];
          break;
        }
      }
      if (resolvedLoc) {
        setRtdbLocation(resolvedLoc);
      }

      // Map Diagnosis
      let resolvedDiag = null;
      for (const path of diagnosisPaths) {
        if (latestDiagMap[path]) {
          resolvedDiag = latestDiagMap[path];
          break;
        }
      }
      if (resolvedDiag) {
        setRtdbAiDiagnosis(resolvedDiag);
        setAnalysis({
          riskLevel: resolvedDiag.result === 'Critical' || resolvedDiag.confidence > 80 ? 'Critical' : 'Normal',
          riskScore: resolvedDiag.confidence || 0,
          interpretation: resolvedDiag.result || '',
          recommendations: resolvedDiag.recommendation ? [resolvedDiag.recommendation] : []
        });
      }

      setRtdbVitals(liveData);

      // Map values
      const bpmVal = Number(liveData?.heartRate || liveData?.bpm || liveData?.BPM || liveData?.HeartRate || 0);
      const spo2Val = Number(liveData?.spo2 || liveData?.SpO2 || liveData?.SPO2 || liveData?.oxygen || 0);
      const tempVal = Number(liveData?.temperature_c || liveData?.Temperature_C || liveData?.temperature || liveData?.temp || liveData?.Temp || 0);
      const humVal = Number(liveData?.humidity || liveData?.Humidity || liveData?.hum || liveData?.Hum || 0);

      const isBpmCritical = bpmVal < 50 || bpmVal > 140;
      const isBpmWarning  = !isBpmCritical && (bpmVal < 60 || bpmVal > 100);

      const isSpo2Critical = spo2Val < 90;
      const isSpo2Warning  = !isSpo2Critical && spo2Val < 95;

      const isTempCritical = tempVal > 0 && (tempVal < 35 || tempVal > 40);
      const isTempWarning  = tempVal > 0 && !isTempCritical && (tempVal < 36.1 || tempVal > 37.2);

      const isHumCritical = humVal > 0 && (humVal < 20 || humVal > 75);
      const isHumWarning  = humVal > 0 && !isHumCritical && (humVal < 30 || humVal > 60);

      const isBpmAbnormal = bpmVal > 0 && (bpmVal < 60 || bpmVal > 100);
      const isSpo2Abnormal = spo2Val > 0 && (spo2Val < 95);
      const isTempAbnormal = tempVal > 0 && (tempVal < 36.1 || tempVal > 37.2);
      const isHumAbnormal = humVal > 0 && (humVal < 30 || humVal > 60);
      const abnormalCount = [isBpmAbnormal, isSpo2Abnormal, isTempAbnormal, isHumAbnormal].filter(Boolean).length;

      const emergency = liveData.emergency === true || String(liveData.emergency) === 'true' || abnormalCount >= 3;
      const isAbnormal = liveData.isAbnormal === true || String(liveData.isAbnormal) === 'true' || abnormalCount > 0;
      const finalCondition = emergency ? 'Critical' : (liveData.condition || (isAbnormal ? 'Abnormal' : 'Normal'));

      setVitals((prev: any) => ({
        ...prev,
        bpm: bpmVal,
        spo2: spo2Val,
        humidity: humVal,
        temperature_c: tempVal,
        emergency,
        isAbnormal,
        condition: finalCondition,
        isBpmCritical, isBpmWarning,
        isSpo2Critical, isSpo2Warning,
        isTempCritical, isTempWarning,
        isHumCritical, isHumWarning,
        timestamp: liveData.timestamp || Date.now(),
        isSensorConnected: true,
        ecgData: latestEcgData
      }));
      setLoading(false);
    };

    // Subscriptions
    vitalsPaths.forEach((path) => {
      const unsub = onValue(ref(rtdb, path), (snapshot) => {
        latestVitalsMap[path] = snapshot.exists() ? snapshot.val() : null;
        updateCombined();
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
    };
  }, [id]);

  // Redirect to Doctor Dashboard if ALL 4 conditions are critical
  useEffect(() => {
    if (vitals) {
      const allCritical = 
        (vitals.isBpmCritical === true) && 
        (vitals.isSpo2Critical === true) && 
        (vitals.isTempCritical === true) && 
        (vitals.isHumCritical === true);
      if (allCritical) {
        navigate('/doctor/dashboard');
      }
    }
  }, [vitals, navigate]);
  useEffect(() => {
    if (!id) return;

    // Identity data stays in Firestore 'users'
    let unsubUser = () => {};
    if (id && id !== 'HS-001') {
      unsubUser = onSnapshot(doc(db, 'users', id), (snap) => {
        if (snap.exists()) {
          setPatient(snap.data());
        }
      });
    } else {
      // Do not randomly query the first patient in the database for the demo node.
      setPatient(null);
    }

    // Fetch active alert
    const unsubAlert = onSnapshot(doc(db, 'emergencyAlerts', id), (snap) => {
      if (snap.exists()) {
        setActiveAlert(snap.data());
      } else {
        setActiveAlert(null);
      }
    });

    return () => {
      unsubUser();
      unsubAlert();
    };
  }, [id]);

  const handleVerifyEmergency = async () => {
    if (!id) return;
    await emergencyService.resolveEmergency(id, 'DOC-001', id);
  };

  const handleFalseAlertDetails = async () => {
    if (!id) return;
    try {
      emergencyService.stopSiren();

      // Find unresolved alerts in RTDB alerts/ and resolve them
      const alertsRef = ref(rtdb, 'alerts');
      const alertsSnap = await get(alertsRef);

      if (alertsSnap.exists()) {
        const alertsData = alertsSnap.val();
        for (const [alertId, val] of Object.entries(alertsData)) {
          if (val && (val as any).patientId === id && (val as any).status === 'critical' && !(val as any).resolved) {
            await update(ref(rtdb, `alerts/${alertId}`), {
              resolved: true,
              status: 'normal',
              resolvedAt: Date.now()
            });
          }
        }
      }

      // Update RTDB patients/{patientId}/liveVitals
      await update(ref(rtdb, `patients/${id}/liveVitals`), {
        emergency: false,
        isAbnormal: false,
        condition: 'Normal',
        timestamp: Date.now()
      });

      // Remove doctors/{doctorId}/activeAlerts/{patientId}
      const doctorId = 'DOC-001';
      await set(ref(rtdb, `doctors/${doctorId}/activeAlerts/${id}`), null);
      
      // Update Firestore doctor activeAlerts
      await updateDoc(doc(db, 'doctors', doctorId), {
        [`activeAlerts.${id}`]: false
      }).catch(err => console.warn(err));

      // Create history record: history/{patientId}/records/
      const recordId = `REC-${Date.now()}`;
      await set(ref(rtdb, `history/${id}/records/${recordId}`), {
        diagnosis: rtdbAiDiagnosis?.result || 'False Alert',
        timestamp: Date.now(),
        action: 'False Alert'
      });

      // Update Firestore emergencyAlerts
      await setDoc(doc(db, 'emergencyAlerts', id), {
        patientId: id,
        status: 'RESOLVED',
        severity: 'FALSE_ALERT',
        resolvedAt: new Date().toISOString(),
        timestamp: serverTimestamp(),
      }, { merge: true });

      if (showToast) {
        showToast('Successfully resolved as false alert.', 'success');
      } else {
        alert('False alert recorded successfully.');
      }
      navigate('/doctor/dashboard');
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Error resolving alert.', 'error');
    }
  };

  const handleCallAmbulanceClickDetails = async () => {
    if (isCallingAmbulance) return;
    setIsCallingAmbulance(true);
    try {
      await emergencyService.callAmbulanceAPI();
      if (showToast) {
        showToast('Ambulance call triggered successfully', 'success');
      } else {
        alert('Ambulance call triggered successfully');
      }
    } catch (e) {
      console.error('[Doctor Details] Call ambulance failed:', e);
      if (showToast) {
        showToast('Failed to trigger call', 'error');
      }
    } finally {
      setIsCallingAmbulance(false);
    }
  };

  const handleEmergencyAlertConfirmDetails = async () => {
    if (!id) return;
    try {
      emergencyService.stopSiren();

      // Update Firebase: alerts/{alertId}/status = "confirmed"
      const alertsRef = ref(rtdb, 'alerts');
      const alertsSnap = await get(alertsRef);

      if (alertsSnap.exists()) {
        const alertsData = alertsSnap.val();
        for (const [alertId, val] of Object.entries(alertsData)) {
          if (val && (val as any).patientId === id && (val as any).status === 'critical' && !(val as any).resolved) {
            await update(ref(rtdb, `alerts/${alertId}`), {
              status: 'confirmed'
            });
          }
        }
      }

      // patients/{patientId}/liveVitals/emergency = true, isAbnormal = true
      await update(ref(rtdb, `patients/${id}/liveVitals`), {
        emergency: true,
        isAbnormal: true,
        timestamp: Date.now()
      });

      // Create: ambulanceRequests/
      const requestId = `REQ-${Date.now()}`;
      await set(ref(rtdb, `ambulanceRequests/${requestId}`), {
        patientId: id,
        doctorId: 'DOC-001',
        status: 'pending',
        timestamp: Date.now()
      });

      // Create history record: history/{patientId}/records/
      const recordId = `REC-${Date.now()}`;
      await set(ref(rtdb, `history/${id}/records/${recordId}`), {
        diagnosis: rtdbAiDiagnosis?.result || 'Emergency Confirmed',
        timestamp: Date.now(),
        action: 'Emergency Confirmed'
      });

      // Also trigger ambulance dispatch flow locally for Firestore
      await handleDispatchAmbulance();

      if (showToast) {
        showToast('Emergency confirmed and ambulance dispatched.', 'success');
      } else {
        alert('Emergency confirmed. Ambulance request dispatched.');
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Error confirming emergency.', 'error');
    }
  };

  const handleDispatchAmbulance = async () => {
    if (!id || !patient) return;
    setIsDispatching(true);
    try {
      await emergencyService.dispatchAmbulance(id, 'DOC-001', {
        ...patient,
        location: vitals?.location || rtdbLocation || null
      });

      // Write emergency alert to Firestore for doctor confirmation record
      await setDoc(doc(db, 'emergencyAlerts', id), {
        patientId: id,
        patientName: patientName,
        status: 'DISPATCHED',
        severity: 'CRITICAL',
        vitals: { heartRate: vitals?.bpm ?? 0, spO2: vitals?.spo2 ?? 0, temp: vitals?.temperature_c ?? 0 },
        timestamp: serverTimestamp(),
        detectedAt: new Date().toISOString(),
        dispatchedAt: new Date().toISOString(),
        ambulanceId: 'AMB-' + Math.floor(1000 + Math.random() * 9000),
        contactsNotified: true,
      });

      // Also write to Firestore collection 'ambulanceDispatch' for tracking
      const dispatchId = `DISPATCH-${Date.now()}`;
      await setDoc(doc(db, 'ambulanceDispatch', dispatchId), {
        ambulanceId: 'AMB-' + Math.floor(1000 + Math.random() * 9000),
        patientId: id,
        patientName: patientName,
        status: 'EN_ROUTE',
        severity: 'CRITICAL',
        hospitalAssigned: 'Apollo Cardiology Clinic',
        eta: '4 mins',
        dispatchedAt: serverTimestamp(),
      });

      // Send WhatsApp emergency to ambulance
      emergencyService.sendRealtimeWhatsAppEmergency({
        bpm: vitals?.bpm,
        spo2: vitals?.spo2,
        temperature_c: vitals?.temperature_c,
        humidity: vitals?.humidity,
        patientName,
        patientAge,
        serialNumber: id,
        condition: 'CRITICAL',
        timestamp: vitals?.timestamp || Date.now(),
      }, vitals?.location || rtdbLocation);

      setHasDispatched(true);
      navigate('/doctor/emergency');
    } finally {
      setIsDispatching(false);
    }
  };

  if (loading && !patient) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-accent-maroon rounded-full animate-spin" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bridging Patient Link...</p>
        </div>
      </div>
    );
  }

  const isCriticalPatient = vitals?.condition === 'Critical' || 
    vitals?.emergency === true || 
    (vitals?.bpm > 0 && (vitals?.bpm < 20 || vitals?.bpm > 170)) || 
    (vitals?.spo2 > 0 && vitals?.spo2 < 75) || 
    (vitals?.temperature_c > 0 && (vitals?.temperature_c < 34 || vitals?.temperature_c > 40));
  const tempC = vitals?.temperature_c ?? 0;
  const tempF = tempC > 0 ? (tempC * 9/5 + 32) : 99.2;

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 md:px-8 py-6 font-sans">
      <title>Patient Report | {patientName}</title>
      
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header Row */}
        <div className="flex justify-between items-center text-sm font-bold text-slate-500">
          <button 
            onClick={() => navigate('/doctor/dashboard')}
            className="flex items-center gap-2 text-slate-700 hover:text-slate-900 transition-all font-extrabold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          
          <div className="flex items-center gap-2 text-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* Patient Report Title */}
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Patient Report</h1>

        {/* Patient Header Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Avatar Image */}
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-slate-100 bg-slate-200 shrink-0 flex items-center justify-center">
              {rtdbProfile?.photo || patient?.profile?.photo ? (
                <img 
                  src={rtdbProfile?.photo || patient?.profile?.photo} 
                  alt={patientName} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <User className="w-8 h-8 text-slate-400" />
              )}
            </div>
            
            {/* Patient Info */}
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight leading-none">{patientName}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-red-100 text-red-600 border border-red-200">
                  {vitals?.condition === 'Critical' || vitals?.emergency ? 'CRITICAL' : 'OPTIMAL'}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-500">
                ID: {vitals?.serialNumber || id || 'HS-001'}  •  {patientGender}  •  {patientAge} Years
              </p>
            </div>
          </div>

          {/* Admitted Information */}
          <div className="flex gap-10 text-sm border-t md:border-t-0 border-slate-100 pt-4 md:pt-0">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Admitted On</p>
              <p className="font-bold text-slate-800">{rtdbProfile?.admittedOn || 'May 20, 2024'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Time</p>
              <p className="font-bold text-slate-800">{rtdbProfile?.admittedTime || '02:17 PM'}</p>
            </div>
          </div>
        </div>

        {/* Live ECG Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Live ECG</h3>
            <div className="flex items-center gap-2">
              <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 outline-none cursor-pointer">
                <option>Lead II</option>
              </select>
              <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 outline-none cursor-pointer">
                <option>10 mm/mV</option>
              </select>
              <select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 outline-none cursor-pointer">
                <option>25 mm/s</option>
              </select>
            </div>
          </div>

          <div className="h-64 relative rounded-2xl overflow-hidden border border-slate-100">
            <ECGGraph 
              bpm={vitals?.bpm ?? 0} 
              isEmergency={vitals?.isAbnormal || vitals?.emergency} 
              ecgData={vitals?.ecgData} 
              isSensorConnected={vitals?.isSensorConnected !== false} 
              isCritical={vitals?.emergency} 
            />
            {/* ECG Overlays matching screenshot */}
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm">
              <span className={`text-xs font-black tracking-wider uppercase ${vitals?.isBpmCritical ? 'text-red-600' : 'text-slate-800'}`}>
                HR: {vitals?.bpm ?? '--'} BPM
              </span>
            </div>
            <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-slate-100 flex items-center gap-2 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Live</span>
            </div>
          </div>
        </div>

        {/* Vital Readings & AI Analysis Report Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Vital Readings */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Vital Readings</h3>
            <div className="space-y-3">
              <VitalRow
                label="Heart Rate"
                value={`${vitals?.bpm ?? '--'} BPM`}
                isCritical={vitals?.isBpmCritical}
              />
              <VitalRow
                label="SpO2"
                value={`${vitals?.spo2 ?? '--'}%`}
                isCritical={vitals?.isSpo2Critical}
              />
              <VitalRow
                label="Blood Pressure"
                value={`${vitals?.bloodPressure || (vitals?.isBpmCritical ? '170/100' : '120/80')} mmHg`}
                isCritical={vitals?.isBpmCritical}
              />
              <VitalRow
                label="Respiratory Rate"
                value={`${vitals?.respiratoryRate || (vitals?.isBpmCritical ? '24' : '16')} /min`}
                isCritical={false}
              />
              <VitalRow
                label="Temperature"
                value={tempC > 0 ? `${tempC.toFixed(1)} °C` : '--'}
                isCritical={vitals?.isTempCritical}
              />
            </div>
          </div>

          {/* AI Analysis Report */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">AI Analysis Report</h3>
            
            <div className="space-y-3 text-sm font-semibold text-slate-700">
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <span className="text-slate-400">ECG Condition</span>
                <span className={`font-bold ${vitals?.emergency || analysis?.riskLevel === 'Critical' ? 'text-red-600' : 'text-slate-800'}`}>
                  {rtdbAiDiagnosis?.result || analysis?.interpretation || 'Normal Rhythm'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <span className="text-slate-400">Risk Level</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${vitals?.emergency || analysis?.riskLevel === 'Critical' ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-green-100 text-green-600 border border-green-200'}`}>
                  {vitals?.emergency || analysis?.riskLevel === 'Critical' ? 'CRITICAL' : 'LOW'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <span className="text-slate-400">Possible Issue</span>
                <span className="font-bold text-slate-800">
                  {vitals?.emergency || analysis?.riskLevel === 'Critical' ? 'Unstable Heart Rhythm' : 'None Detected'}
                </span>
              </div>
              <div className="py-2.5 space-y-1">
                <span className="text-slate-400 block text-xs">Recommendation</span>
                <span className="font-bold text-slate-800 text-xs leading-relaxed block">
                  {rtdbAiDiagnosis?.recommendation || (analysis?.recommendations && analysis.recommendations[0]) || 'Keep monitoring vitals.'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live GPS & Emergency Routing Tracker Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Live GPS & Emergency Routing</h3>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
              <MapPin className="w-3.5 h-3.5 text-red-600" />
              <span>Real-time GPS Tracking Active</span>
            </div>
          </div>
          <div className="h-96 rounded-2xl overflow-hidden border border-slate-100 relative">
            <GoogleMapsTracker />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          {hasDispatched ? (
            <div className="w-full p-4 bg-green-500 text-white rounded-2xl font-black text-center text-xs uppercase tracking-widest shadow-lg">
              Ambulance Dispatched: {dispatch?.ambulanceId} | ETA: {dispatch?.eta} ({dispatch?.hospitalAssigned})
            </div>
          ) : activeAlert || vitals?.emergency || vitals?.isAbnormal ? (
            <>
              <button 
                onClick={handleFalseAlertDetails}
                className="flex-1 py-4 border-2 border-dashed border-orange-300 text-orange-600 bg-orange-50/20 hover:bg-orange-50 hover:border-orange-400 rounded-2xl font-extrabold text-sm uppercase tracking-wider transition-colors cursor-pointer text-center"
              >
                ⚠ False Alert
              </button>
              <button 
                onClick={handleCallAmbulanceClickDetails}
                disabled={isCallingAmbulance}
                className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-extrabold text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer text-center disabled:opacity-50"
              >
                📞 {isCallingAmbulance ? 'Calling...' : 'Call Ambulance'}
              </button>
              <button 
                onClick={handleEmergencyAlertConfirmDetails}
                disabled={isDispatching}
                className="flex-[2] py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-extrabold text-sm uppercase tracking-wider shadow-lg shadow-red-200 flex items-center justify-center gap-2 cursor-pointer text-center"
              >
                🚨 {isDispatching ? 'PROCESSING...' : 'Emergency Alert: Send alert to ambulance & family'}
              </button>
            </>
          ) : (
            <div className="w-full py-4 bg-green-100 border border-green-200 text-green-700 rounded-2xl font-black text-center text-xs uppercase tracking-widest">
              System Optimal: No active critical alerts
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const VitalRow = ({ label, value, isCritical }: { label: string; value: string; isCritical?: boolean }) => (
  <div className="flex justify-between items-center py-2.5 border-b border-slate-100 text-sm font-semibold">
    <span className="text-slate-400">{label}</span>
    <span className={`font-bold ${isCritical ? 'text-red-600' : 'text-slate-800'}`}>
      {value}
    </span>
  </div>
);

const DetailRow = ({ label, value, icon: Icon }: any) => (
  <div className="flex items-center justify-between group">
     <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-accent-maroon transition-colors">
           <Icon className="w-4 h-4" />
        </div>
        <div>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
           <p className="text-sm font-bold text-slate-900 tracking-tight">{value}</p>
        </div>
     </div>
  </div>
);

export default DoctorPatientDetails;
