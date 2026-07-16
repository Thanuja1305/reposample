import React from 'react';
import { motion } from 'motion/react';
import { Bot, Zap, Activity, ShieldAlert, History, Heart, Thermometer, Droplets } from 'lucide-react';
import PatientSidebar from '../components/PatientSidebar';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, rtdb } from '../../shared/lib/firebase';
import { ref, onValue } from 'firebase/database';

const AIAssessment = ({ isEmbedded = false }: { isEmbedded?: boolean }) => {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [patientData, setPatientData] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [rtdbDiagnosis, setRtdbDiagnosis] = useState<any>(null);
  const lastWriteTime = useRef(0);
  const lastDataRef = useRef<any>(null);

  // Patient ID for the RTDB structure
  const PATIENT_ID = 'HS-001';

  useEffect(() => {
    if (user) {
      const docRef = doc(db, 'patients', user.uid);
      const unsubscribe = onSnapshot(docRef, (snap) => {
        if (snap.exists()) setPatientData(snap.data());
      });
      return () => unsubscribe();
    }
  }, [user]);

  // 🔥 REALTIME: Listen to patients/HS-001/aiDiagnosis for live diagnosis results
  useEffect(() => {
    const diagRef = ref(rtdb, `patients/${PATIENT_ID}/aiDiagnosis`);
    const unsubDiag = onValue(diagRef, (snap) => {
      if (snap.exists()) {
        setRtdbDiagnosis(snap.val());
      }
    });
    return () => unsubDiag();
  }, []);

  // Risk Level Color Helper
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Critical':
      case 'High Risk':
        return 'text-red-600';
      case 'Elevated':
        return 'text-amber-500';
      case 'Inactive':
        return 'text-slate-400';
      default:
        return 'text-green-600';
    }
  };

  const getRiskBg = (level: string) => {
    switch (level) {
      case 'Critical':
      case 'High Risk':
        return 'bg-red-50 border-red-200';
      case 'Elevated':
        return 'bg-amber-50 border-amber-200';
      case 'Inactive':
        return 'bg-slate-50 border-slate-200';
      default:
        return 'bg-green-50 border-green-200';
    }
  };

  // 🧠 Real-time Medical Diagnosis Engine — subscribes to ALL vitals paths
  useEffect(() => {
    if (!user) return;

    const latestVitalsMap: Record<string, any> = {};

    // ✅ EXACT same paths as PatientDashboard.tsx
    const vitalsPaths = [
      `patients/${PATIENT_ID}/liveVitals`,
      `liveHealthMetrics/${PATIENT_ID}`,
      `liveHealthMetrics/HS-001`,
      `users/${user.uid}/liveReading`,
      `users/m1uph2bX7SVd9Wbyge1AMqAmq093/liveReading`,
      `users/onYK6WJGu6VR6fEgQXBhximLEFI3/liveReading`,
      `users/HS-001/liveReading`
    ];

    const runDiagnostic = () => {
      // Find the first path that has real vitals data
      let liveData: any = null;
      for (const path of vitalsPaths) {
        const d = latestVitalsMap[path];
        if (d && typeof d === 'object') {
          liveData = d;
          break;
        }
      }

      if (!liveData) {
        setAnalysis({
          riskScore: 0,
          riskLevel: 'Inactive',
          interpretation: 'Awaiting active synchronization with clinical IoT devices... Please ensure your sensor is connected and properly placed.',
          recommendations: [
            "Place your finger securely on the Max30102 pulse oximeter sensor.",
            "Verify that your HeartSync IoT device is powered on and connected to Wi-Fi.",
            "Ensure the real-time telemetry stream is active in your dashboard."
          ],
          vitals: { bpm: 0, spo2: 0, temp: 0, humidity: 0 },
          timestamp: { toDate: () => new Date() }
        });
        return;
      }

      // ─── Extract vitals from the data (try every possible key name) ─────
      const bpm  = Number(liveData.heartRate || liveData.bpm || liveData.BPM || liveData.HeartRate || 0);
      const spo2 = Number(liveData.spo2 || liveData.SpO2 || liveData.SPO2 || liveData.oxygen || liveData.o2 || 0);
      const temp = Number(liveData.temperature_c || liveData.Temperature_C || liveData.temp || liveData.Temp || liveData.temperature || 0);
      const humidity = Number(liveData.humidity || liveData.Humidity || 0);
      const condition = liveData.condition || liveData.Condition || '';
      const emergency = liveData.emergency === true || liveData.emergency === 'true';

      // If both BPM and SpO2 are 0 → sensor is not active
      if (bpm === 0 && spo2 === 0) {
        setAnalysis({
          riskScore: 0,
          riskLevel: 'Inactive',
          interpretation: 'Awaiting active synchronization with clinical IoT devices... Please ensure your sensor is connected and properly placed.',
          recommendations: [
            "Place your finger securely on the Max30102 pulse oximeter sensor.",
            "Verify that your HeartSync IoT device is powered on and connected to Wi-Fi.",
            "Ensure the real-time telemetry stream is active in your dashboard."
          ],
          vitals: { bpm, spo2, temp, humidity },
          timestamp: { toDate: () => new Date() }
        });
        return;
      }

      // ─── AI Diagnostic Rules Engine ─────────────────────────────────
      const isBpmCritical  = bpm < 50 || bpm > 140;
      const isBpmWarning   = !isBpmCritical && (bpm < 60 || bpm > 100);
      const isSpo2Critical = spo2 < 90;
      const isSpo2Warning  = !isSpo2Critical && spo2 < 95;
      const isTempCritical = temp > 0 && (temp < 35 || temp > 40);
      const isTempWarning  = temp > 0 && !isTempCritical && (temp < 36 || temp > 38);

      const isBpmAbnormal = bpm > 0 && (bpm < 60 || bpm > 100);
      const isSpo2Abnormal = spo2 > 0 && (spo2 < 95);
      const isTempAbnormal = temp > 0 && (temp < 36.1 || temp > 37.2);
      const isHumAbnormal = humidity > 0 && (humidity < 30 || humidity > 60);
      const abnormalCount = [isBpmAbnormal, isSpo2Abnormal, isTempAbnormal, isHumAbnormal].filter(Boolean).length;

      const critCount = [isBpmCritical, isSpo2Critical, isTempCritical].filter(Boolean).length;
      const warnCount = [isBpmWarning, isSpo2Warning, isTempWarning].filter(Boolean).length;
      const isFullEmergency = critCount >= 2 || condition === 'Critical' || emergency || abnormalCount >= 3;

      let riskScore = 0;
      let riskLevel = 'Normal';
      let interpretation = '';
      let recommendations: string[] = [];
      let possibleConditions: string[] = [];

      if (isFullEmergency) {
        riskScore = 99;
        riskLevel = 'Critical';
        interpretation = `CRITICAL EMERGENCY — Multiple vitals are dangerously abnormal. BPM: ${bpm}, SpO2: ${spo2}%, Temp: ${temp}°C. Immediate life-saving intervention required.`;
        recommendations = [
          "🚨 IMMEDIATE AMBULANCE DISPATCH REQUIRED",
          "Administer supplemental high-flow oxygen therapy",
          "Prepare for potential cardiac resuscitation (CPR/AED)",
          "Continuous ECG and vital monitoring mandatory",
          "Notify emergency contact and physician dashboard immediately"
        ];
        possibleConditions = ["Cardiac Arrest Risk", "Severe Hypoxia", "Multi-organ Distress"];
      } else if (isBpmCritical && isSpo2Critical) {
        riskScore = 95;
        riskLevel = 'High Risk';
        interpretation = `Heart Rate (${bpm} BPM) and SpO2 (${spo2}%) are both critically abnormal. High risk of cardiac event or respiratory failure.`;
        recommendations = [
          "Escalate to on-call cardiologist immediately",
          "Initiate supplemental oxygen therapy",
          "Perform 12-lead ECG within the next 5 minutes",
          "Prepare IV access and emergency medications"
        ];
        possibleConditions = ["Acute Coronary Syndrome", "Respiratory Failure", "Cardiogenic Shock"];
      } else if (isBpmCritical) {
        riskScore = 87;
        riskLevel = 'High Risk';
        interpretation = bpm < 50
          ? `Severe Bradycardia detected — ${bpm} BPM. Heart rate dangerously low. Risk of syncope, cardiac arrest, or hemodynamic instability.`
          : `Severe Tachycardia detected — ${bpm} BPM. Heart rate dangerously elevated. Extreme cardiac stress and potential arrhythmia risk.`;
        recommendations = [
          "Perform immediate 12-lead ECG",
          "Assess for chest pain, dizziness, or shortness of breath",
          bpm < 50 ? "Consider atropine if symptomatic bradycardia" : "Consider rate control with beta-blocker",
          "Prepare emergency antiarrhythmic protocols"
        ];
        possibleConditions = bpm < 50
          ? ["AV Block", "Sick Sinus Syndrome", "Vagal Response"]
          : ["SVT", "Atrial Fibrillation", "Ventricular Tachycardia"];
      } else if (isSpo2Critical) {
        riskScore = 91;
        riskLevel = 'High Risk';
        interpretation = `Severe Hypoxia — SpO2 at ${spo2}%. Critically low blood oxygen. Patient may experience confusion, cyanosis, or organ damage.`;
        recommendations = [
          "Initiate supplemental oxygen therapy immediately (nasal cannula or mask)",
          "Assess airway patency and respiratory effort",
          "Check for signs of cyanosis (blue lips, fingertips)",
          "Order arterial blood gas (ABG) analysis"
        ];
        possibleConditions = ["Pneumonia", "Pulmonary Embolism", "COPD Exacerbation", "Acute Asthma"];
      } else if (isTempCritical) {
        riskScore = 85;
        riskLevel = 'High Risk';
        interpretation = temp < 35
          ? `Hypothermia detected — ${temp}°C. Core body temperature dangerously low. Risk of cardiac arrhythmia.`
          : `High-grade Fever — ${temp}°C. Possible severe infection or sepsis requiring urgent treatment.`;
        recommendations = [
          temp < 35 ? "Initiate active external rewarming" : "Administer antipyretics (acetaminophen/ibuprofen)",
          temp < 35 ? "Monitor for J-waves on ECG" : "Draw blood cultures and start empiric antibiotics if sepsis suspected",
          "Monitor for hemodynamic instability",
          "Ensure continuous temperature monitoring"
        ];
        possibleConditions = temp < 35
          ? ["Environmental Hypothermia", "Hypothyroidism", "Septic Shock"]
          : ["Sepsis", "Viral Infection", "Bacterial Infection", "Heat Stroke"];
      } else if (warnCount >= 2) {
        riskScore = 55;
        riskLevel = 'Elevated';
        interpretation = `Multiple vitals outside optimal range — BPM: ${bpm}, SpO2: ${spo2}%, Temp: ${temp}°C. Close monitoring recommended.`;
        recommendations = [
          "Instruct patient to rest in a comfortable position",
          "Recheck vitals in 15 minutes",
          "Review current medications for side effects",
          "Schedule physician consultation if trends persist"
        ];
        possibleConditions = ["Stress Response", "Dehydration", "Early Infection"];
      } else if (isBpmWarning) {
        riskScore = 40;
        riskLevel = 'Elevated';
        interpretation = `BPM at ${bpm} — outside optimal resting range (60–100 BPM). May indicate stress, dehydration, or early arrhythmia.`;
        recommendations = [
          "Instruct patient to rest and hydrate",
          "Review recent physical activity or caffeine intake",
          "Monitor for palpitations or lightheadedness",
          "Schedule follow-up if trend persists beyond 30 minutes"
        ];
        possibleConditions = ["Sinus Tachycardia/Bradycardia", "Anxiety", "Dehydration"];
      } else if (isSpo2Warning) {
        riskScore = 38;
        riskLevel = 'Elevated';
        interpretation = `SpO2 at ${spo2}% — slightly below normal (≥95%). Watch for respiratory decline or worsening oxygenation.`;
        recommendations = [
          "Encourage deep breathing exercises",
          "Ensure patient is in an upright position",
          "Monitor closely during physical exertion",
          "Investigate possible early respiratory distress"
        ];
        possibleConditions = ["Mild Hypoxemia", "Early Pneumonia", "Sleep Apnea"];
      } else if (isTempWarning) {
        riskScore = 30;
        riskLevel = 'Elevated';
        interpretation = `Temperature at ${temp}°C — slightly outside normal range (36–38°C). May indicate early fever or mild hypothermia.`;
        recommendations = [
          "Monitor temperature every 30 minutes",
          "Ensure adequate hydration",
          "Review for early signs of infection"
        ];
        possibleConditions = ["Low-grade Fever", "Mild Infection", "Thermoregulation Issue"];
      } else {
        riskScore = 5;
        riskLevel = 'Normal';
        interpretation = `All vitals within normal clinical ranges — BPM: ${bpm}, SpO2: ${spo2}%, Temp: ${temp}°C. Patient is hemodynamically stable.`;
        recommendations = [
          "No clinical alerts detected. Continue routine monitoring.",
          "Maintain balanced diet, hydration, and regular exercise.",
          "Next scheduled check-up recommended as planned."
        ];
        possibleConditions = ["Healthy / Stable"];
      }

      const currentAnalysis = {
        riskScore,
        riskLevel,
        interpretation,
        recommendations,
        possibleConditions,
        vitals: { bpm, spo2, temp, humidity },
        timestamp: { toDate: () => new Date() }
      };

      setAnalysis(currentAnalysis);

      // Save analysis to Firestore so Doctor dashboard can access the same AI report
      const now = Date.now();
      if (now - lastWriteTime.current > 5000 || isFullEmergency) {
        lastWriteTime.current = now;
        setDoc(doc(db, 'aiAnalysis', user.uid), {
          ...currentAnalysis,
          timestamp: serverTimestamp()
        }, { merge: true }).catch(e => {
          console.error("Firestore write failed:", e);
        });
      }
    };

    // Subscribe to ALL vitals paths
    const unsubs = vitalsPaths.map((path) => {
      const targetRef = ref(rtdb, path);
      return onValue(targetRef, (snapshot) => {
        latestVitalsMap[path] = snapshot.exists() ? snapshot.val() : null;
        runDiagnostic();
      }, (err) => {
        console.warn(`AI Diagnosis: Error on path ${path}:`, err);
        latestVitalsMap[path] = null;
        runDiagnostic();
      });
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [user]);

  // ─── Vitals status helpers ─────────────────────────────────────────
  const getVitalStatus = (label: string, value: number) => {
    if (value === 0) return { color: 'text-slate-400', bg: 'bg-slate-50', status: '—' };
    if (label === 'bpm') {
      if (value < 50 || value > 140) return { color: 'text-red-600', bg: 'bg-red-50', status: 'Critical' };
      if (value < 60 || value > 100) return { color: 'text-amber-500', bg: 'bg-amber-50', status: 'Warning' };
      return { color: 'text-green-600', bg: 'bg-green-50', status: 'Normal' };
    }
    if (label === 'spo2') {
      if (value < 90) return { color: 'text-red-600', bg: 'bg-red-50', status: 'Critical' };
      if (value < 95) return { color: 'text-amber-500', bg: 'bg-amber-50', status: 'Warning' };
      return { color: 'text-green-600', bg: 'bg-green-50', status: 'Normal' };
    }
    if (label === 'temp') {
      if (value < 35 || value > 40) return { color: 'text-red-600', bg: 'bg-red-50', status: 'Critical' };
      if (value < 36 || value > 38) return { color: 'text-amber-500', bg: 'bg-amber-50', status: 'Warning' };
      return { color: 'text-green-600', bg: 'bg-green-50', status: 'Normal' };
    }
    return { color: 'text-green-600', bg: 'bg-green-50', status: 'Normal' };
  };

  const content = (
    <div className={`max-w-6xl mx-auto space-y-6 md:space-y-8 ${isEmbedded ? '' : 'p-4 md:p-12'}`}>
      <div className="grid lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-8 space-y-6 md:space-y-8">

          {/* ─── Risk Score Card ─────────────────────────────────── */}
          <div className="bg-white rounded-[28px] md:rounded-[40px] p-6 md:p-10 border border-slate-100 shadow-premium relative overflow-hidden">
            <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-accent-maroon/5 rounded-full blur-[80px]" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6 md:mb-12">
                <h3 className="text-[9px] md:text-sm font-bold text-slate-900 uppercase tracking-widest">Heart Attack Risk Rating</h3>
                <div className="p-2 bg-accent-maroon/5 rounded-lg md:rounded-xl text-accent-maroon">
                  <Zap className="w-4 h-4 md:w-5 md:h-5" />
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-12">
                <div className="relative w-36 h-36 md:w-48 md:h-48 shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="50%" cy="50%" r="45%" className="stroke-slate-50 fill-none" strokeWidth="10" />
                    <motion.circle
                      cx="50%" cy="50%" r="45%"
                      className="stroke-accent-maroon fill-none"
                      strokeWidth="10"
                      strokeLinecap="round"
                      initial={{ strokeDashoffset: 100 }}
                      animate={{ strokeDashoffset: 100 - (analysis?.riskScore || 0) }}
                      style={{ pathLength: 1 }}
                      transition={{ duration: 1.5, ease: "circOut" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight">{analysis?.riskScore ?? '0'}</span>
                    <span className="text-[8px] md:text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">
                      {rtdbDiagnosis?.confidence ? `${Math.round(Number(rtdbDiagnosis.confidence) * 100)}%` : 'Risk Index'}
                    </span>
                  </div>
                </div>
                
                <div className="flex-1 space-y-5 text-center md:text-left">
                  <div>
                    <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 md:mb-2">Clinical Interpretation</p>
                    <p className="text-sm md:text-lg font-medium text-slate-800 leading-snug md:leading-tight">
                      {rtdbDiagnosis?.diagnosis || analysis?.interpretation || 'Awaiting synchronization with clinical devices for real-time risk assessment.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div className={`p-2.5 md:p-4 rounded-xl md:rounded-2xl border ${getRiskBg(analysis?.riskLevel || 'Normal')}`}>
                      <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 md:mb-1">Risk Level</p>
                      <p className={`text-xs md:text-sm font-bold ${getRiskColor(analysis?.riskLevel || 'Normal')}`}>
                        {analysis?.riskLevel || 'Normal'}
                      </p>
                    </div>
                    <div className="p-2.5 md:p-4 bg-slate-50/50 rounded-xl md:rounded-2xl border border-slate-100">
                      <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 md:mb-1">Last Updated</p>
                      <p className="text-xs md:text-sm font-bold text-slate-900">
                        {analysis?.timestamp?.toDate ? analysis.timestamp.toDate().toLocaleTimeString() : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Live Vitals Breakdown ──────────────────────────── */}
          {analysis?.vitals && (analysis.vitals.bpm > 0 || analysis.vitals.spo2 > 0) && (
            <div className="bg-white rounded-[28px] md:rounded-[40px] p-6 md:p-10 border border-slate-100 shadow-premium">
              <div className="flex items-center gap-4 mb-4 md:mb-8 text-slate-900">
                <div className="p-2 bg-accent-maroon/5 rounded-lg md:rounded-xl text-accent-maroon">
                  <Activity className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <h3 className="text-[9px] md:text-sm font-bold uppercase tracking-widest">Live Vitals Breakdown</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {[
                  { label: 'bpm', icon: Heart, title: 'Heart Rate', value: analysis.vitals.bpm, unit: 'BPM', range: '60–100' },
                  { label: 'spo2', icon: Droplets, title: 'SpO2', value: analysis.vitals.spo2, unit: '%', range: '≥95%' },
                  { label: 'temp', icon: Thermometer, title: 'Temperature', value: analysis.vitals.temp, unit: '°C', range: '36–38' },
                  { label: 'humidity', icon: Droplets, title: 'Humidity', value: analysis.vitals.humidity, unit: '%', range: '30–60%' },
                ].map((v) => {
                  const status = getVitalStatus(v.label, v.value);
                  return (
                    <div key={v.label} className={`p-4 md:p-5 rounded-2xl border ${status.bg} border-opacity-50 transition-all`}>
                      <div className="flex items-center gap-2 mb-2">
                        <v.icon className={`w-4 h-4 ${status.color}`} />
                        <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest">{v.title}</span>
                      </div>
                      <p className={`text-xl md:text-2xl font-bold ${status.color}`}>
                        {v.value > 0 ? v.value : '—'}
                        <span className="text-[10px] md:text-xs font-medium text-slate-400 ml-1">{v.value > 0 ? v.unit : ''}</span>
                      </p>
                      <p className="text-[8px] md:text-[9px] text-slate-400 mt-1">Normal: {v.range}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Possible Conditions ───────────────────────────── */}
          {analysis?.possibleConditions && analysis.possibleConditions.length > 0 && analysis.riskLevel !== 'Inactive' && (
            <div className="bg-white rounded-[28px] md:rounded-[40px] p-6 md:p-10 border border-slate-100 shadow-premium">
              <div className="flex items-center gap-4 mb-4 md:mb-8 text-slate-900">
                <div className="p-2 bg-accent-maroon/5 rounded-lg md:rounded-xl text-accent-maroon">
                  <Bot className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <h3 className="text-[9px] md:text-sm font-bold uppercase tracking-widest">AI Predicted Conditions</h3>
              </div>
              <div className="flex flex-wrap gap-2 md:gap-3">
                {analysis.possibleConditions.map((cond: string, i: number) => (
                  <span
                    key={i}
                    className={`px-3 md:px-4 py-1.5 md:py-2 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider border ${
                      analysis.riskLevel === 'Critical' || analysis.riskLevel === 'High Risk'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : analysis.riskLevel === 'Elevated'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-green-50 text-green-700 border-green-200'
                    }`}
                  >
                    {cond}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ─── Clinical Recommendations ──────────────────────── */}
          <div className="bg-white rounded-[28px] md:rounded-[40px] p-6 md:p-10 border border-slate-100 shadow-premium">
            <div className="flex items-center gap-4 mb-4 md:mb-8 text-slate-900">
              <div className="p-2 bg-accent-maroon/5 rounded-lg md:rounded-xl text-accent-maroon">
                <ShieldAlert className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <h3 className="text-[9px] md:text-sm font-bold uppercase tracking-widest">Clinical Recommendations</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 md:gap-4">
              {(rtdbDiagnosis?.recommendation
                ? [rtdbDiagnosis.recommendation]
                : (analysis?.recommendations || ["No clinical alerts detected. Continue maintaining balanced lifestyle and monitoring."])
              ).map((rec: string, i: number) => (
                <div key={i} className="flex gap-3 md:gap-4 p-4 md:p-6 bg-slate-50/50 rounded-2xl border border-slate-50 group hover:bg-white hover:border-accent-maroon/10 hover:shadow-premium transition-all">
                  <div className={`w-6 h-6 md:w-8 md:h-8 ${
                    analysis?.riskLevel === 'Critical' || analysis?.riskLevel === 'High Risk' ? 'bg-red-600' : 'bg-accent-maroon'
                  } text-white rounded-lg md:rounded-xl flex items-center justify-center shrink-0 font-bold text-[9px] md:text-xs`}>
                    {i + 1}
                  </div>
                  <p className="text-[11px] md:text-sm font-medium text-slate-600 leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Right Sidebar ──────────────────────────────────── */}
        <div className="lg:col-span-4 space-y-6 md:space-y-8">

          {/* System Status */}
          <div className="bg-slate-900 rounded-[32px] md:rounded-[40px] p-6 md:p-8 text-white relative overflow-hidden h-fit shadow-premium">
            <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-accent-maroon/20 rounded-full blur-[50px]" />
            <h4 className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-6 opacity-40">System Status</h4>
            <div className="space-y-5 md:space-y-6">
              <StatusItem label="Diagnostic Engine" status="Online" active />
              <StatusItem label="Pattern Recognition" status="Enabled" active />
              <StatusItem
                label="Clinical Synapse"
                status={analysis && analysis.riskLevel !== 'Inactive' ? 'Active' : 'Standby'}
                active={analysis && analysis.riskLevel !== 'Inactive'}
              />
              <StatusItem
                label="Risk Assessment"
                status={analysis?.riskLevel || 'Waiting'}
                active={analysis && analysis.riskLevel !== 'Inactive'}
              />
            </div>
          </div>

          {/* Historical Trends */}
          <div className="bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-8 border border-slate-100 shadow-premium overflow-hidden relative">
            <h4 className="text-[9px] md:text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-6 border-b border-slate-50 pb-4">Historical Trends</h4>
            <div className="space-y-6">
              <p className="text-[9px] md:text-[10px] font-medium text-slate-400 uppercase tracking-widest text-center py-6 md:py-10 leading-relaxed">
                Sync medical history to view <br />clinical health trends
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isEmbedded) return content;

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden relative font-sans text-slate-900">
      <PatientSidebar 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        patientData={patientData} 
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 md:h-24 bg-white/70 backdrop-blur-2xl border-b border-slate-100 px-4 md:px-12 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <Bot className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="hidden sm:block p-2 text-white bg-accent-maroon rounded-xl md:rounded-2xl shadow-lg shadow-accent-maroon/20">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base md:text-2xl font-black text-slate-900 tracking-tight">AI Assessment</h1>
                <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Diagnostic Core v4.2</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-12">
          {content}
        </main>
      </div>
    </div>
  );
};

const StatusItem = ({ label, status, active = false }: any) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-bold opacity-60">{label}</span>
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
      <span className="text-[10px] font-black uppercase tracking-widest">{status}</span>
    </div>
  </div>
);

export default AIAssessment;
