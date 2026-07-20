import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Stethoscope, 
  Users, 
  Activity, 
  Bell, 
  MapPin, 
  Search, 
  Filter, 
  ArrowRight, 
  HeartPulse, 
  AlertCircle,
  Clock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  ChevronRight,
  TrendingUp,
  Menu,
  Heart,
  Droplets,
  X,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, limit, orderBy, doc, updateDoc, serverTimestamp, setDoc, getDocs } from 'firebase/firestore';
import { ref, onValue, update, set } from 'firebase/database';
import { db, rtdb } from '../../shared/lib/firebase';
import DoctorSidebar from '../components/DoctorSidebar';
import ECGGraph from '../components/patient/ECGGraph';
import DoctorEmergencyModal from '../components/DoctorEmergencyModal';
import { emergencyService } from '../../backend/services/emergencyService';

// Helper to resolve field name differences between IoT firmware versions
const getHR = (v: any) => v?.bpm ?? v?.heartRate;
const getO2 = (v: any) => v?.spo2 ?? v?.o2;

const checkIsCritical = (v: any) => {
  if (!v) return false;
  return v.condition === 'Critical';
};

const DoctorDashboard = () => {
  const { profile, logout, user, showToast } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [rtdbPatientsData, setRtdbPatientsData] = useState<Record<string, any>>({});
  const [rtdbAlertsData, setRtdbAlertsData] = useState<Record<string, any>>({});
  const [activeEmergencyPatient, setActiveEmergencyPatient] = useState<any | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [rtdbUsersData, setRtdbUsersData] = useState<Record<string, any>>({});
  const [rtdbLiveHealthData, setRtdbLiveHealthData] = useState<Record<string, any>>({});
  const [isCallingAmbulance, setIsCallingAmbulance] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const getPatientTelemetry = (patientId: string, combinedData: Record<string, any>) => {
    const rtdbPatient = combinedData[patientId];
    if (!rtdbPatient) return null;

    // Cascade through all possible data source structures:
    // 1. rtdbPatient.liveVitals (standard)
    // 2. rtdbPatient.liveReading (user node)
    // 3. liveHealthMetrics node (ESP32 direct)
    // 4. rtdbPatient itself if it has heartRate/bpm at root level (alert-seeded data)
    const liveVitals = rtdbPatient.liveVitals || rtdbPatient.liveReading || rtdbLiveHealthData[patientId] || {};
    const aiDiagnosis = rtdbPatient.aiDiagnosis || rtdbLiveHealthData[patientId]?.aiDiagnosis || combinedData['HS-001']?.aiDiagnosis || {};
    const ecgData = rtdbPatient.ecgData || liveVitals.ecgData || liveVitals.ecg || rtdbLiveHealthData[patientId]?.ecgData || [];
    const location = rtdbPatient.location || liveVitals.location || {};
    const profileData = rtdbPatient.profile || {};

    // Try to get vitals from liveVitals first, then fall back to root-level fields (alert-seeded data)
    const hr = liveVitals.heartRate ?? liveVitals.bpm ?? liveVitals.BPM ?? liveVitals.HeartRate ?? rtdbPatient.heartRate ?? rtdbPatient.bpm ?? '--';
    const spo2 = liveVitals.spo2 ?? liveVitals.SpO2 ?? liveVitals.SPO2 ?? liveVitals.oxygen ?? rtdbPatient.spo2 ?? '--';
    const temp = liveVitals.temperature_c ?? liveVitals.temperature ?? liveVitals.temp ?? rtdbPatient.temperature_c ?? rtdbPatient.temperature ?? '--';
    const hum = liveVitals.humidity ?? liveVitals.hum ?? rtdbPatient.humidity ?? '--';
    const emergency = liveVitals.emergency === true || String(liveVitals.emergency) === 'true' || rtdbPatient.emergency === true || String(rtdbPatient.emergency) === 'true';
    const isAbnormal = liveVitals.isAbnormal === true || String(liveVitals.isAbnormal) === 'true' || rtdbPatient.isAbnormal === true || String(rtdbPatient.isAbnormal) === 'true';
    const condition = liveVitals.condition || rtdbPatient.condition || '';

    // Check if there is an active/unresolved critical alert in alerts node
    let hasCriticalAlertObj = false;
    let criticalAlertId = null;
    let alertData: any = null;
    if (rtdbAlertsData) {
      const matchingAlertEntry = Object.entries(rtdbAlertsData).find(([id, val]: any) => {
        return val && 
               val.patientId === patientId && 
               !val.resolved && 
               (val.status === 'critical' || val.severity === 'CRITICAL' || val.emergency === true || val.condition === 'Critical') &&
               !dismissedAlerts.includes(id) &&
               !dismissedAlerts.includes(patientId);
      });
      if (matchingAlertEntry) {
        hasCriticalAlertObj = true;
        criticalAlertId = matchingAlertEntry[0];
        alertData = matchingAlertEntry[1];
      }
    }

    // If we have alert data and vitals are '--', override with alert values
    const finalHr = hr !== '--' ? hr : (alertData?.bpm ?? alertData?.heartRate ?? '--');
    const finalSpo2 = spo2 !== '--' ? spo2 : (alertData?.spo2 ?? '--');
    const finalTemp = temp !== '--' ? temp : (alertData?.temperature_c ?? alertData?.temperature ?? '--');
    const finalHum = hum !== '--' ? hum : (alertData?.humidity ?? '--');
    const finalEmergency = emergency || (alertData?.emergency === true);
    const finalIsAbnormal = isAbnormal || (alertData?.isAbnormal === true);
    const finalCondition = condition || alertData?.condition || '';

    const bpmVal = Number(finalHr);
    const isBpmCritical = !isNaN(bpmVal) && (bpmVal < 50 || bpmVal > 140);

    const spo2Val = Number(finalSpo2);
    const isSpo2Critical = !isNaN(spo2Val) && (spo2Val < 90);

    const tempVal = Number(finalTemp);
    const isTempCritical = !isNaN(tempVal) && (tempVal < 35 || tempVal > 40);

    const humVal = Number(finalHum);
    const isHumCritical = !isNaN(humVal) && (humVal < 20 || humVal > 75);

    const anyVitalsCritical = isBpmCritical || isSpo2Critical || isTempCritical || isHumCritical || finalEmergency || finalCondition === 'Critical' || finalIsAbnormal || hasCriticalAlertObj;

    const isCritical = anyVitalsCritical && !dismissedAlerts.includes(patientId);

    return {
      liveVitals,
      aiDiagnosis,
      ecgData,
      location,
      profile: profileData,
      hr: finalHr,
      spo2: finalSpo2,
      temp: finalTemp,
      hum: finalHum,
      emergency: finalEmergency,
      isAbnormal: finalIsAbnormal,
      condition: finalCondition,
      isCritical,
      criticalAlertId,
      raw: rtdbPatient
    };
  };

  useEffect(() => {
    if (profile?.role !== 'doctor') {
      navigate('/');
      return;
    }

    const qPatients = query(
      collection(db, 'users'),
      where('role', '==', 'patient'),
      where('status', '==', 'approved'),
      limit(20)
    );

    const unsubPatients = onSnapshot(qPatients, (snap) => {
      setPatients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.warn("Failed to fetch patients list:", err);
      setLoading(false);
    });

    const qAlerts = query(
      collection(db, 'emergencyAlerts'),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubAlerts = onSnapshot(qAlerts, (snap) => {
      const allAlerts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAlerts(allAlerts.filter((a: any) => a.severity !== 'FALSE_ALERT'));
    });

    // Listen to RTDB patients for real-time emergency detection
    const unsubRtdbPatients = onValue(ref(rtdb, 'patients'), (snapshot) => {
      if (snapshot.exists()) {
        setRtdbPatientsData(snapshot.val());
      } else {
        setRtdbPatientsData({});
      }
    });

    const unsubRtdbUsers = onValue(ref(rtdb, 'users'), (snapshot) => {
      if (snapshot.exists()) {
        setRtdbUsersData(snapshot.val());
      } else {
        setRtdbUsersData({});
      }
    });

    // Listen to RTDB liveHealthMetrics (ESP32 direct data)
    const unsubRtdbLiveHealth = onValue(ref(rtdb, 'liveHealthMetrics'), (snapshot) => {
      if (snapshot.exists()) {
        setRtdbLiveHealthData(snapshot.val());
      } else {
        setRtdbLiveHealthData({});
      }
    });

    // Listen to RTDB alerts
    const unsubRtdbAlerts = onValue(ref(rtdb, 'alerts'), (snapshot) => {
      if (snapshot.exists()) {
        setRtdbAlertsData(snapshot.val());
      } else {
        setRtdbAlertsData({});
      }
    });

    return () => {
      if (typeof unsubPatients === 'function') unsubPatients();
      if (typeof unsubAlerts === 'function') unsubAlerts();
      if (typeof unsubRtdbPatients === 'function') unsubRtdbPatients();
      if (typeof unsubRtdbUsers === 'function') unsubRtdbUsers();
      if (typeof unsubRtdbLiveHealth === 'function') unsubRtdbLiveHealth();
      if (typeof unsubRtdbAlerts === 'function') unsubRtdbAlerts();
      emergencyService.stopSiren();
    };
  }, [profile, navigate]);

  // Trigger/update emergency popup if any patient becomes critical
  useEffect(() => {
    let foundCriticalPatient: any = null;
    const stablePatientIds: string[] = [];
    const combinedData: Record<string, any> = { ...rtdbPatientsData, ...rtdbUsersData };

    // Merge liveHealthMetrics into combinedData so ESP32 direct data is visible
    for (const [pid, metricsData] of Object.entries(rtdbLiveHealthData)) {
      if (!combinedData[pid]) {
        combinedData[pid] = { liveVitals: metricsData };
      } else if (!combinedData[pid].liveVitals && !combinedData[pid].liveReading) {
        combinedData[pid].liveVitals = metricsData;
      }
    }

    // Also include patient IDs that have active alerts
    const allPatientIds = new Set(Object.keys(combinedData));
    if (rtdbAlertsData) {
      Object.values(rtdbAlertsData).forEach((alert: any) => {
        if (alert.patientId && !alert.resolved) {
          allPatientIds.add(alert.patientId);
          // Seed combinedData if missing
          if (!combinedData[alert.patientId]) {
            combinedData[alert.patientId] = {
              profile: { name: alert.patientName || 'Unknown Patient' },
              liveVitals: {
                heartRate: alert.bpm || alert.heartRate,
                spo2: alert.spo2,
                temperature_c: alert.temperature_c || alert.temperature,
                humidity: alert.humidity,
                condition: alert.condition || alert.severity
              }
            };
          }
        }
      });
    }

    for (const patientId of Array.from(allPatientIds)) {
      const tel = getPatientTelemetry(patientId as string, combinedData);
      if (tel) {
        if (tel.isCritical) {
          const isDismissed = dismissedAlerts.includes(patientId as string) || (tel.criticalAlertId && dismissedAlerts.includes(tel.criticalAlertId));
          
          if (!isDismissed) {
            // Find if this patient is in Firestore list
            let p = patients.find(pat => pat.id === patientId || pat.serialNumber === patientId);
            if (!p) {
              // Try to get name/age from the alert data itself
              const alertForPatient = rtdbAlertsData ? Object.values(rtdbAlertsData).find((a: any) => a.patientId === patientId && !a.resolved) : null;
              const patientName = tel.profile.name || tel.raw?.patientName || (alertForPatient as any)?.patientName || 'Active Patient';
              const patientAge = tel.profile.age || tel.raw?.patientAge || (alertForPatient as any)?.age || '--';
              p = {
                id: patientId,
                serialNumber: patientId,
                fullName: patientName,
                displayName: patientName,
                profile: {
                  fullName: patientName,
                  age: patientAge,
                  gender: tel.profile.gender || 'Male',
                  bloodGroup: tel.profile.bloodGroup || '--'
                }
              };
            }
            
            foundCriticalPatient = {
              patient: p,
              vitals: {
                ...tel.liveVitals,
                bpm: tel.hr,
                spo2: tel.spo2,
                temperature_c: tel.temp,
                humidity: tel.hum,
                patientName: p.profile?.fullName || p.displayName,
                age: p.profile?.age,
                gender: p.profile?.gender,
                bloodGroup: p.profile?.bloodGroup,
                ecg: Array.isArray(tel.ecgData) ? tel.ecgData : (tel.ecgData.waveform || []),
                alertReason: (tel.criticalAlertId && rtdbAlertsData?.[tel.criticalAlertId]?.alertReason) || tel.aiDiagnosis.result || 'Critical',
                timestamp: tel.liveVitals.timestamp || Date.now(),
                aiDiagnosis: tel.aiDiagnosis,
                location: tel.location,
                alertId: tel.criticalAlertId
              },
              tel: tel
            };
          }
        } else {
          stablePatientIds.push(patientId);
          if (tel.criticalAlertId) {
            stablePatientIds.push(tel.criticalAlertId);
          }
        }
      }
    }

    // Clean up stable patient IDs from dismissed list to allow future triggers
    if (stablePatientIds.length > 0) {
      const remainingDismissed = dismissedAlerts.filter(id => !stablePatientIds.includes(id));
      if (remainingDismissed.length !== dismissedAlerts.length) {
        setDismissedAlerts(remainingDismissed);
      }
    }

    if (foundCriticalPatient) {
      setActiveEmergencyPatient(foundCriticalPatient);
      emergencyService.playSiren();
    } else {
      setActiveEmergencyPatient(null);
      emergencyService.stopSiren();
    }
  }, [rtdbPatientsData, rtdbUsersData, rtdbAlertsData, rtdbLiveHealthData, patients, dismissedAlerts]);

  const handleFalseAlert = async () => {
    if (activeEmergencyPatient?.patient?.id) {
      emergencyService.stopSiren();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      const patientId = activeEmergencyPatient.patient.id;
      
      // Update dismissed list immediately
      if (activeEmergencyPatient.vitals.alertId) {
        setDismissedAlerts(prev => [...prev, activeEmergencyPatient.vitals.alertId]);
      } else {
        setDismissedAlerts(prev => [...prev, patientId]);
      }

      try {
        // Update RTDB alerts
        if (activeEmergencyPatient.vitals.alertId) {
          const rtdbAlertRef = ref(rtdb, `alerts/${activeEmergencyPatient.vitals.alertId}`);
          await update(rtdbAlertRef, {
            resolved: true,
            status: 'normal',
            resolvedAt: Date.now()
          });
        } else {
          // If no specific alertId, look for unresolved critical alerts for this patient and resolve them
          if (rtdbAlertsData) {
            for (const [id, val] of Object.entries(rtdbAlertsData)) {
              if (val && (val as any).patientId === patientId && (val as any).status === 'critical' && !(val as any).resolved) {
                await update(ref(rtdb, `alerts/${id}`), {
                  resolved: true,
                  status: 'normal',
                  resolvedAt: Date.now()
                });
              }
            }
          }
        }

        // Update RTDB patient liveVitals
        const rtdbVitalsRef = ref(rtdb, `patients/${patientId}/liveVitals`);
        await update(rtdbVitalsRef, {
          emergency: false,
          isAbnormal: false,
          condition: 'Normal',
          timestamp: Date.now()
        });

        // Remove activeAlerts flag from doctor
        const doctorId = 'DOC-001';
        const doctorActiveAlertRef = ref(rtdb, `doctors/${doctorId}/activeAlerts/${patientId}`);
        await set(doctorActiveAlertRef, null);

        // Update Firestore doctor activeAlerts
        const docRef = doc(db, 'doctors', doctorId);
        await updateDoc(docRef, {
          [`activeAlerts.${patientId}`]: false
        }).catch(err => console.warn(err));

        // Create history record: history/{patientId}/records/
        const recordId = `REC-${Date.now()}`;
        const historyRef = ref(rtdb, `history/${patientId}/records/${recordId}`);
        await set(historyRef, {
          diagnosis: activeEmergencyPatient.vitals.aiDiagnosis?.result || 'Critical Condition Resolved',
          timestamp: Date.now(),
          action: 'False Alert'
        });

        // Update Firestore emergencyAlerts for status list
        await setDoc(doc(db, 'emergencyAlerts', patientId), {
          patientId: patientId,
          status: 'RESOLVED',
          severity: 'FALSE_ALERT',
          resolvedAt: new Date().toISOString(),
          timestamp: serverTimestamp(),
        }, { merge: true });

        if (showToast) {
          showToast('Successfully resolved as false alert.', 'success');
        }
      } catch (err) {
        console.error("Failed to mark false alert", err);
        if (showToast) {
          showToast('Error resolving alert.', 'error');
        }
      }
    }
    setActiveEmergencyPatient(null);
  };

  const handleCallAmbulanceClick = async () => {
    if (isCallingAmbulance) return;
    setIsCallingAmbulance(true);
    try {
      await emergencyService.callAmbulanceAPI();
    } catch (e) {
      console.error('[Doctor Dashboard] Call ambulance failed:', e);
    } finally {
      setIsCallingAmbulance(false);
    }
  };

  const handleClosePopup = () => {
    if (activeEmergencyPatient?.vitals?.alertId) {
      setDismissedAlerts(prev => [...prev, activeEmergencyPatient.vitals.alertId]);
    } else if (activeEmergencyPatient?.patient?.id) {
      setDismissedAlerts(prev => [...prev, activeEmergencyPatient.patient.id]);
    }
    setActiveEmergencyPatient(null);
    emergencyService.stopSiren();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    navigate('/doctor/dashboard');
  };

  const handleConfirmCritical = () => {
    if (activeEmergencyPatient?.patient?.id) {
      const patientId = activeEmergencyPatient.patient.id;
      if (activeEmergencyPatient.vitals?.alertId) {
        setDismissedAlerts(prev => [...prev, activeEmergencyPatient.vitals.alertId]);
      } else {
        setDismissedAlerts(prev => [...prev, patientId]);
      }
      
      // Trigger the backend Twilio sequence
      emergencyService.sendRealtimeWhatsAppEmergency(activeEmergencyPatient.vitals, activeEmergencyPatient.vitals.location);
      
      emergencyService.stopSiren();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setActiveEmergencyPatient(null);
      if (showToast) showToast('Emergency Confirmed. Escalating to Ambulance and Emergency Contacts.', 'error');
    }
  };

  useEffect(() => {
    if (activeEmergencyPatient) {
      if (!isMuted) {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const msg = new SpeechSynthesisUtterance("Critical patient detected. Immediate medical intervention required.");
          msg.rate = 1.0;
          window.speechSynthesis.speak(msg);
        }
        emergencyService.playSiren();
      } else {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        emergencyService.stopSiren();
      }
    } else {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      emergencyService.stopSiren();
    }
  }, [activeEmergencyPatient, isMuted]);

  const handleToggleMute = React.useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const handleViewPatient = React.useCallback((targetPatientId: string) => {
    emergencyService.stopSiren();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    navigate(`/doctor/report/${targetPatientId}`);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex overflow-hidden font-sans text-slate-800">
      <title>Clinical Registry | HeartSync</title>
      
      {/* MOBILE OVERLAY */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] lg:hidden"
          />
        )}
      </AnimatePresence>

      <DoctorSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      <main className="flex-1 flex min-w-0 overflow-hidden h-screen">
        
        {/* MIDDLE PANEL: Clinical Registry */}
        <div className="flex-1 flex flex-col min-w-0 h-full border-r border-slate-200/60 bg-[#F8F9FA] overflow-y-auto no-scrollbar">
           {/* Header */}
           <header className="px-8 py-6 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-4">
               <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-red-800 transition-all">
                  <Menu className="w-6 h-6" />
               </button>
               <div>
                 <h2 className="text-xl font-display font-black text-slate-900 tracking-tight">Clinical Registry</h2>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time Telemetry Processing</p>
               </div>
             </div>
             <div className="flex items-center gap-6 hidden sm:flex">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search patient..." className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-red-800 focus:ring-1 focus:ring-red-800 w-48" />
                </div>
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-right border-l border-slate-200 pl-4">
                   <p className="text-xs font-bold text-slate-900">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                </div>
             </div>
           </header>

           <div className="px-8 pb-8">
             {(() => {
                const combinedData: Record<string, any> = { ...rtdbPatientsData, ...rtdbUsersData };

                // Merge liveHealthMetrics
                for (const [pid, metricsData] of Object.entries(rtdbLiveHealthData)) {
                  if (!combinedData[pid]) {
                    combinedData[pid] = { liveVitals: metricsData };
                  } else if (!combinedData[pid].liveVitals && !combinedData[pid].liveReading) {
                    combinedData[pid].liveVitals = metricsData;
                  }
                }

                // Include alert patient IDs for the render loop too
                const allPatientIds = new Set(Object.keys(combinedData));
                if (rtdbAlertsData) {
                  Object.values(rtdbAlertsData).forEach((alert: any) => {
                    if (alert.patientId && !alert.resolved) {
                      allPatientIds.add(alert.patientId);
                      if (!combinedData[alert.patientId]) {
                        combinedData[alert.patientId] = {
                          profile: { name: alert.patientName || 'Unknown Patient' },
                          liveVitals: {
                            heartRate: alert.bpm || alert.heartRate,
                            spo2: alert.spo2,
                            temperature_c: alert.temperature_c || alert.temperature,
                            humidity: alert.humidity,
                            condition: alert.condition || alert.severity
                          }
                        };
                      }
                    }
                  });
                }

                const allMapped = Array.from(allPatientIds).map(patientIdStr => {
                  const patientId = patientIdStr as string;
                  const tel = getPatientTelemetry(patientId, combinedData);
                  let p = patients.find(pat => pat.id === patientId || pat.serialNumber === patientId);
                  if (!p) {
                    const alertForPatient = rtdbAlertsData ? Object.values(rtdbAlertsData).find((a: any) => a.patientId === patientId && !a.resolved) : null;
                    const patientName = tel?.profile?.name || tel?.raw?.patientName || (alertForPatient as any)?.patientName || 'Active Patient';
                    const patientAge = tel?.profile?.age || tel?.raw?.patientAge || (alertForPatient as any)?.age || '--';
                    p = {
                      id: patientId,
                      serialNumber: patientId,
                      fullName: patientName,
                      displayName: patientName,
                      profile: {
                        fullName: patientName,
                        age: patientAge,
                        gender: tel?.profile?.gender || 'Male',
                        bloodGroup: tel?.profile?.bloodGroup || '--'
                      }
                    };
                  }
                  return { patient: p, tel };
                }).filter(x => x.tel !== null);

                const criticalPatients = allMapped.filter(x => x.tel?.isCritical);
                const stablePatients = allMapped.filter(x => !x.tel?.isCritical);

                const primaryPatient = activeEmergencyPatient || criticalPatients[0] || stablePatients[0];
                const activeId = primaryPatient?.patient?.id;

                return (
                  <div className="space-y-6">
                    <DoctorEmergencyModal
                      activeEmergencyPatient={activeEmergencyPatient}
                      isMuted={isMuted}
                      onToggleMute={handleToggleMute}
                      onClose={handleClosePopup}
                      onIgnoreAlert={handleFalseAlert}
                      onConfirmCritical={handleConfirmCritical}
                      onViewPatient={handleViewPatient}
                      onCallAmbulance={handleCallAmbulanceClick}
                      isCallingAmbulance={isCallingAmbulance}
                    />

                    {primaryPatient && (
                      <div className="bg-white border border-slate-200/60 rounded-[32px] p-6 shadow-sm relative overflow-hidden cursor-pointer" onClick={() => { emergencyService.stopSiren(); navigate(`/doctor/report/${primaryPatient.patient.id}`); }}>
                        {primaryPatient.tel?.isCritical && <div className="absolute top-6 right-6 px-3 py-1 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-red-100 hidden sm:block">CRITICAL</div>}
                        {!primaryPatient.tel?.isCritical && <div className="absolute top-6 right-6 px-3 py-1 bg-green-50 text-green-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-green-100 hidden sm:block">STABLE</div>}
                        
                        <div className="flex items-center gap-4 mb-8">
                           <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 font-bold text-xl overflow-hidden shrink-0">
                             {primaryPatient.patient.photoURL ? <img src={primaryPatient.patient.photoURL} className="w-full h-full object-cover" /> : primaryPatient.patient.fullName?.charAt(0) || 'P'}
                           </div>
                           <div>
                             <h3 className="text-xl font-display font-black text-slate-900">{primaryPatient.patient.fullName}</h3>
                             <p className="text-[11px] font-medium text-slate-500 mt-1">ID: {primaryPatient.patient.id?.slice(0,6)} • {primaryPatient.patient.profile?.gender || 'Unknown'} • {primaryPatient.patient.profile?.age || '--'} Years</p>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 md:mb-8">
                           <div className="text-center">
                              <div className="flex items-center justify-center gap-1.5 mb-2 text-red-500">
                                <Heart className="w-4 h-4 fill-current" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Heart Rate</span>
                              </div>
                              <p className={`text-xl font-black ${primaryPatient.tel?.hr !== '--' && (Number(primaryPatient.tel?.hr) < 50 || Number(primaryPatient.tel?.hr) > 140) ? 'text-red-600' : 'text-slate-900'}`}>{primaryPatient.tel?.hr} <span className="text-xs font-semibold text-slate-400">BPM</span></p>
                           </div>
                           <div className="text-center md:border-l border-slate-100">
                              <div className="flex items-center justify-center gap-1.5 mb-2 text-blue-500">
                                <Droplets className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SpO2</span>
                              </div>
                              <p className={`text-xl font-black ${primaryPatient.tel?.spo2 !== '--' && Number(primaryPatient.tel?.spo2) < 90 ? 'text-red-600' : 'text-slate-900'}`}>{primaryPatient.tel?.spo2} <span className="text-xs font-semibold text-slate-400">%</span></p>
                           </div>
                           <div className="text-center md:border-l border-slate-100">
                              <div className="flex items-center justify-center gap-1.5 mb-2 text-purple-500">
                                <Activity className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">BP</span>
                              </div>
                              <p className="text-xl font-black text-slate-900">--/--</p>
                           </div>
                           <div className="text-center border-l border-slate-100">
                              <div className="flex items-center justify-center gap-1.5 mb-2 text-red-500">
                                <HeartPulse className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">ECG Status</span>
                              </div>
                              <p className={`text-sm font-bold mt-1 ${primaryPatient.tel?.isCritical ? 'text-red-600' : 'text-green-600'}`}>{primaryPatient.tel?.isCritical ? 'Abnormal' : 'Normal'}</p>
                           </div>
                        </div>

                        {primaryPatient.tel?.isCritical && (
                          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                             <div>
                               <div className="flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                                 <p className="text-xs font-bold text-slate-700">Alert Triggered</p>
                               </div>
                               <p className="text-[10px] text-slate-500 mt-1 ml-4">Just now</p>
                             </div>
                             <button onClick={(e) => { e.stopPropagation(); emergencyService.stopSiren(); navigate(`/doctor/report/${primaryPatient.patient.id}`); }} className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors">
                               View Report →
                             </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                       <h3 className="text-sm font-display font-bold text-slate-900 mb-4">Other Monitored Patients</h3>
                       <div className="bg-white border border-slate-200/60 rounded-[24px] overflow-hidden overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead>
                              <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                <th className="px-6 py-4 font-bold">Patient</th>
                                <th className="px-6 py-4 font-bold text-center">Age</th>
                                <th className="px-6 py-4 font-bold">Vitals</th>
                                <th className="px-6 py-4 font-bold text-center">Status</th>
                                <th className="px-6 py-4 font-bold hidden sm:table-cell">Last Update</th>
                                <th className="px-6 py-4 font-bold"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {allMapped.filter(x => x.patient.id !== activeId).map((x) => (
                                <tr key={x.patient.id} className="hover:bg-slate-50/80 transition-colors cursor-pointer group" onClick={() => navigate(`/doctor/report/${x.patient.id}`)}>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">
                                        {x.patient.photoURL ? <img src={x.patient.photoURL} className="w-full h-full object-cover rounded-full" /> : x.patient.fullName?.charAt(0) || 'P'}
                                      </div>
                                      <div>
                                        <p className="text-xs font-bold text-slate-900 group-hover:text-red-800 transition-colors">{x.patient.fullName}</p>
                                        <p className="text-[10px] text-slate-500">{x.patient.profile?.gender || 'Unknown'}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-xs font-medium text-slate-600 text-center">{x.patient.profile?.age || '--'}</td>
                                  <td className="px-6 py-4">
                                    <p className="text-[10px] font-medium text-slate-500">HR: <span className={`font-bold ${x.tel?.hr !== '--' && (Number(x.tel?.hr) < 50 || Number(x.tel?.hr) > 140) ? 'text-red-600' : 'text-slate-900'}`}>{x.tel?.hr} BPM</span></p>
                                    <p className="text-[10px] font-medium text-slate-500">SpO2: <span className={`font-bold ${x.tel?.spo2 !== '--' && Number(x.tel?.spo2) < 90 ? 'text-red-600' : 'text-slate-900'}`}>{x.tel?.spo2}%</span></p>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <span className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md ${x.tel?.isCritical ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                      {x.tel?.isCritical ? 'At Risk' : 'Stable'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-[10px] font-medium text-slate-500 hidden sm:table-cell">
                                    Just now
                                  </td>
                                  <td className="px-6 py-4 text-slate-400 text-right">
                                    <ChevronRight className="w-4 h-4 inline-block opacity-50 group-hover:opacity-100 transition-opacity group-hover:text-red-800" />
                                  </td>
                                </tr>
                              ))}
                              {allMapped.filter(x => x.patient.id !== activeId).length === 0 && (
                                <tr>
                                  <td colSpan={6} className="px-6 py-8 text-center text-xs font-medium text-slate-400">
                                    No other monitored patients
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                       </div>
                    </div>
                  </div>
                );
             })()}
           </div>
        </div>

        {/* RIGHT PANEL: Patient Report */}
        <div className="w-[350px] xl:w-[450px] 2xl:w-[500px] shrink-0 bg-white h-full overflow-y-auto hidden lg:flex flex-col border-l border-slate-200/60 p-6 relative">
             {(() => {
                const combinedData: Record<string, any> = { ...rtdbPatientsData, ...rtdbUsersData };

                // Merge liveHealthMetrics
                for (const [pid, metricsData] of Object.entries(rtdbLiveHealthData)) {
                  if (!combinedData[pid]) {
                    combinedData[pid] = { liveVitals: metricsData };
                  } else if (!combinedData[pid].liveVitals && !combinedData[pid].liveReading) {
                    combinedData[pid].liveVitals = metricsData;
                  }
                }

                // Include alert patient IDs for the render loop too
                const allPatientIds = new Set(Object.keys(combinedData));
                if (rtdbAlertsData) {
                  Object.values(rtdbAlertsData).forEach((alert: any) => {
                    if (alert.patientId && !alert.resolved) {
                      allPatientIds.add(alert.patientId);
                      if (!combinedData[alert.patientId]) {
                        combinedData[alert.patientId] = {
                          profile: { name: alert.patientName || 'Unknown Patient' },
                          liveVitals: {
                            heartRate: alert.bpm || alert.heartRate,
                            spo2: alert.spo2,
                            temperature_c: alert.temperature_c || alert.temperature,
                            humidity: alert.humidity,
                            condition: alert.condition || alert.severity
                          }
                        };
                      }
                    }
                  });
                }

                const allMapped = Array.from(allPatientIds).map(patientIdStr => {
                  const patientId = patientIdStr as string;
                  const tel = getPatientTelemetry(patientId, combinedData);
                  let p = patients.find(pat => pat.id === patientId || pat.serialNumber === patientId);
                  if (!p) { p = { id: patientId, fullName: tel?.profile?.name || tel?.raw?.patientName || 'Active Patient', profile: { age: tel?.profile?.age || tel?.raw?.patientAge || '--', gender: tel?.profile?.gender || 'Male' }}; }
                  return { patient: p, tel };
                }).filter(x => x.tel !== null);

                const criticalPatients = allMapped.filter(x => x.tel?.isCritical);
                const stablePatients = allMapped.filter(x => !x.tel?.isCritical);
                const primaryPatient = activeEmergencyPatient || criticalPatients[0] || stablePatients[0];

                if (!primaryPatient) {
                  return <div className="flex-1 flex items-center justify-center text-sm font-bold text-slate-400">No patient selected</div>;
                }

                const ecgArray = Array.isArray(primaryPatient.tel?.ecgData) ? primaryPatient.tel.ecgData : (primaryPatient.tel?.ecgData?.waveform || []);

                return (
                  <>
                    <div className="flex items-center justify-between mb-8">
                       <h3 className="text-lg font-bold text-slate-900">Patient Report</h3>
                       <div className="flex items-center gap-3 text-right">
                         <div className="flex flex-col">
                           <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Date</span>
                           <span className="text-xs font-bold text-slate-900">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                         </div>
                         <div className="flex flex-col">
                           <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Time</span>
                           <span className="text-xs font-bold text-slate-900">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                         </div>
                       </div>
                    </div>

                    <div className="bg-slate-50/50 border border-slate-100 rounded-[24px] p-5 flex items-center justify-between mb-8 relative">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 font-bold text-xl overflow-hidden shrink-0">
                          {primaryPatient.patient.photoURL ? <img src={primaryPatient.patient.photoURL} className="w-full h-full object-cover" /> : primaryPatient.patient.fullName?.charAt(0) || 'P'}
                        </div>
                        <div>
                          <h4 className="text-lg font-display font-black text-slate-900 leading-tight">{primaryPatient.patient.fullName}</h4>
                          <p className="text-[10px] font-medium text-slate-500 mt-1">ID: {primaryPatient.patient.id?.slice(0,6)} • {primaryPatient.patient.profile?.gender || 'Unknown'} • {primaryPatient.patient.profile?.age || '--'} Years</p>
                        </div>
                      </div>
                      {primaryPatient.tel?.isCritical && (
                        <div className="px-3 py-1 bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-md border border-red-200 shrink-0 absolute top-5 right-5 xl:static">
                          CRITICAL
                        </div>
                      )}
                    </div>

                    <div className="mb-8">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">Live ECG</h4>
                          <span className="text-[10px] font-medium text-slate-500 border border-slate-200 rounded px-2 py-0.5 bg-slate-50">Lead II ⌄</span>
                        </div>
                        <div className="flex items-center gap-2 xl:gap-3 text-[9px] xl:text-[10px] font-medium text-slate-500">
                          <span className="flex items-center gap-1 border border-slate-200 rounded px-2 py-0.5 bg-slate-50">10 mm/mV ⌄</span>
                          <span className="flex items-center gap-1 border border-slate-200 rounded px-2 py-0.5 bg-slate-50">25 mm/s ⌄</span>
                        </div>
                      </div>
                      
                      <div className="bg-white border border-slate-200/60 rounded-[24px] overflow-hidden relative shadow-sm h-[180px] xl:h-[200px]">
                         <ECGGraph 
                           bpm={Number(primaryPatient.tel?.hr) || 0} 
                           isEmergency={primaryPatient.tel?.isCritical} 
                           ecgData={ecgArray} 
                           isSensorConnected={true} 
                           isCritical={primaryPatient.tel?.isCritical}
                         />
                      </div>
                      <div className="flex justify-between items-center mt-3">
                         <p className={`text-[10px] font-black ${primaryPatient.tel?.hr !== '--' && (Number(primaryPatient.tel?.hr) < 50 || Number(primaryPatient.tel?.hr) > 140) ? 'text-red-600' : 'text-slate-900'}`}>HR: {primaryPatient.tel?.hr} BPM</p>
                         <div className="flex items-center gap-1.5">
                           <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                           <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Live</span>
                         </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8 flex-1">
                      {/* Vitals Column */}
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-slate-900 mb-4">Vital Readings</h4>
                        
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                           <span className="text-xs font-medium text-slate-500">Heart Rate</span>
                           <span className={`text-xs font-bold ${primaryPatient.tel?.hr !== '--' && (Number(primaryPatient.tel?.hr) < 50 || Number(primaryPatient.tel?.hr) > 140) ? 'text-red-600' : 'text-slate-900'}`}>{primaryPatient.tel?.hr} BPM</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                           <span className="text-xs font-medium text-slate-500">SpO2</span>
                           <span className={`text-xs font-bold ${primaryPatient.tel?.spo2 !== '--' && Number(primaryPatient.tel?.spo2) < 90 ? 'text-red-600' : 'text-slate-900'}`}>{primaryPatient.tel?.spo2}%</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                           <span className="text-xs font-medium text-slate-500">Blood Pressure</span>
                           <span className="text-xs font-bold text-slate-900">--/-- mmHg</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                           <span className="text-xs font-medium text-slate-500">Respiratory Rate</span>
                           <span className="text-xs font-bold text-slate-900">--/min</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                           <span className="text-xs font-medium text-slate-500">Temperature</span>
                           <span className="text-xs font-bold text-slate-900">{primaryPatient.tel?.temp} °C</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                           <span className="text-xs font-medium text-slate-500">Humidity</span>
                           <span className="text-xs font-bold text-slate-900">{primaryPatient.tel?.hum}%</span>
                        </div>
                      </div>

                      {/* AI Column */}
                      <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 flex flex-col h-full xl:mt-0 mt-2">
                        <div className="flex items-center gap-2 mb-4">
                          <Activity className="w-4 h-4 text-[#800000]" />
                          <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">AI Analysis Report</h4>
                        </div>
                        
                        <div className="space-y-4 flex-1">
                           <div>
                             <div className="flex justify-between items-center mb-1">
                               <p className="text-[10px] text-slate-500">AI Clinical Summary</p>
                               {primaryPatient.tel?.aiDiagnosis?.confidence && (
                                 <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                   Conf: {primaryPatient.tel.aiDiagnosis.confidence}
                                 </span>
                               )}
                             </div>
                             <p className="text-xs font-medium text-slate-700 leading-snug">{primaryPatient.tel?.aiDiagnosis?.summary || primaryPatient.tel?.aiDiagnosis?.diagnosis || (primaryPatient.tel?.isCritical ? 'Critical Vitals Detected' : 'None detected')}</p>
                           </div>
                           <div>
                             <p className="text-[10px] text-slate-500 mb-1">Risk Level</p>
                             <p className={`text-xs font-bold ${primaryPatient.tel?.aiDiagnosis?.riskLevel?.toUpperCase() === 'CRITICAL' || primaryPatient.tel?.isCritical ? 'text-red-600' : 'text-slate-900'}`}>{primaryPatient.tel?.aiDiagnosis?.riskLevel || (primaryPatient.tel?.isCritical ? 'CRITICAL' : 'LOW')}</p>
                           </div>
                           <div>
                             <p className="text-[10px] text-slate-500 mb-1">Abnormal Parameters</p>
                             <div className="flex flex-wrap gap-1">
                               {(primaryPatient.tel?.aiDiagnosis?.abnormalParameters || []).length > 0 ? (
                                 primaryPatient.tel.aiDiagnosis.abnormalParameters.map((param: string, i: number) => (
                                   <span key={i} className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">{param}</span>
                                 ))
                               ) : (
                                 <span className="text-xs font-bold text-slate-900">{primaryPatient.tel?.isCritical ? 'Vitals Out of Bounds' : 'None'}</span>
                               )}
                             </div>
                           </div>
                           <div>
                             <p className="text-[10px] text-slate-500 mb-1">Recommendation</p>
                             <p className="text-[10px] font-medium text-slate-700 leading-relaxed bg-white p-2 rounded-lg border border-slate-100">{primaryPatient.tel?.aiDiagnosis?.recommendation || primaryPatient.tel?.aiDiagnosis?.suggestion || (primaryPatient.tel?.isCritical ? 'Immediate medical attention and emergency treatment recommended.' : 'Continue routine monitoring.')}</p>
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2.5 mt-auto pt-4 shrink-0 flex-wrap sm:flex-nowrap">
                        <button onClick={handleFalseAlert} className="flex-1 py-3.5 border border-[#F0A0A0] bg-orange-50/50 hover:bg-orange-50 text-orange-700 rounded-2xl text-xs font-bold transition-colors flex flex-col items-center justify-center gap-0.5 shadow-sm min-w-[90px] px-1.5">
                           <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> False Alert</span>
                           <span className="text-[8px] sm:text-[9px] font-medium opacity-80 normal-case tracking-normal text-center leading-tight">Mark this as false alert</span>
                        </button>
                        <button onClick={handleCallAmbulanceClick} disabled={isCallingAmbulance} className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 shadow-md disabled:opacity-50 min-w-[95px] px-1.5">
                           <span className="flex items-center gap-1">📞 {isCallingAmbulance ? 'Calling...' : 'Call Ambulance'}</span>
                           <span className="text-[8px] sm:text-[9px] font-medium opacity-80 normal-case tracking-normal text-center leading-tight">Trigger emergency call</span>
                        </button>
                        <button onClick={handleConfirmCritical} className="flex-[1.2] py-3.5 bg-[#D32F2F] hover:bg-[#B71C1C] text-white rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 shadow-md shadow-red-900/20 min-w-[110px] px-1.5">
                           <span className="flex items-center gap-1"><Bell className="w-3.5 h-3.5 fill-current shrink-0" /> Emergency Alert</span>
                           <span className="text-[8px] sm:text-[9px] font-medium opacity-90 normal-case tracking-normal text-center leading-tight">Send alert to ambulance & family</span>
                        </button>
                     </div>
                  </>
                );
             })()}
        </div>

      </main>
    </div>
  );
};

const StatCard = ({ label, value, sub, trend, icon: Icon, color }: { label: string; value: string | number; sub: string; trend: string; icon: any; color?: 'maroon' }) => (
  <div className="bg-white p-6 md:p-8 rounded-[24px] md:rounded-[40px] border border-slate-100 shadow-premium flex items-center gap-4 md:gap-6">
    <div className={`w-12 h-10 md:w-16 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 ${
      color === 'maroon' ? 'bg-accent-maroon text-white shadow-lg shadow-accent-maroon/20' : 'bg-slate-50 text-slate-400'
    }`}>
      <Icon className="w-5 h-5 md:w-7 md:h-7" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
         <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
         <span className={`text-[8px] md:text-[9px] font-black uppercase ${color === 'maroon' ? 'text-medical-red' : 'text-green-500'}`}>{trend}</span>
      </div>
      <p className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter mb-1 truncate">{value}</p>
      <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate">{sub}</p>
    </div>
  </div>
);



export default DoctorDashboard;
