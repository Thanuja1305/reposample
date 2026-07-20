import React, { useEffect, useState, useRef } from 'react';
import { ref, onValue, set, update } from 'firebase/database';
import { rtdb } from '../../shared/lib/firebase';
import { useAuth } from '../context/AuthContext';
import { AlertOctagon, Volume2, VolumeX, ShieldAlert, Sparkles, Activity, MapPin } from 'lucide-react';

// Web Audio API alarm sound synthesizer (bulletproof offline sound generation)
class WebAudioAlarm {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private intervalId: any = null;

  start() {
    if (this.ctx) return;
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
      
      this.osc = this.ctx.createOscillator();
      this.gain = this.ctx.createGain();
      
      this.osc.type = 'sawtooth';
      this.osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      
      this.osc.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      this.osc.start();

      let toggle = false;
      this.intervalId = setInterval(() => {
        if (!this.ctx || !this.gain || !this.osc) return;
        toggle = !toggle;
        this.osc.frequency.setValueAtTime(toggle ? 900 : 700, this.ctx.currentTime);
        this.gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      }, 300);
    } catch (e) {
      console.warn("Failed to play local synthesized alarm sound:", e);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    try {
      if (this.osc) {
        this.osc.stop();
        this.osc.disconnect();
        this.osc = null;
      }
      if (this.gain) {
        this.gain.disconnect();
        this.gain = null;
      }
      if (this.ctx) {
        if (this.ctx.state !== 'closed') {
          this.ctx.close();
        }
        this.ctx = null;
      }
    } catch (e) {
      // Ignore stop errors
    }
  }
}

const alarmSound = new WebAudioAlarm();

// Sub-component for rendering ECG waveform canvas inside the modal
const ECGCanvasChart = ({ data }: { data: number[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid lines (medical style)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.lineWidth = 1;
    const step = 15;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    if (!data || data.length === 0) return;

    // Draw glowing ECG path
    ctx.strokeStyle = '#f87171'; // soft red
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
    ctx.beginPath();

    const xStep = canvas.width / (data.length - 1 || 1);
    const maxVal = Math.max(...data, 1);
    const minVal = Math.min(...data, -1);
    const range = maxVal - minVal || 1;

    data.forEach((val, i) => {
      const x = i * xStep;
      const normalizedY = ((val - minVal) / range) * (canvas.height - 20) + 10;
      const y = canvas.height - normalizedY;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [data]);

  return (
    <div className="relative mt-2">
      <div className="absolute top-2 left-3 flex items-center gap-1.5 px-2 py-0.5 bg-black/60 rounded-full border border-red-500/30">
        <Activity className="w-3.5 h-3.5 text-red-400 animate-pulse" />
        <span className="text-[9px] font-black text-red-300 uppercase tracking-widest leading-none">ECG Waveform Stream</span>
      </div>
      <canvas 
        ref={canvasRef} 
        width={450} 
        height={130} 
        className="w-full h-[130px] bg-slate-950 rounded-xl border border-red-500/20"
      />
    </div>
  );
};

export default function EmergencyAlertModal() {
  const { user, profile } = useAuth();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<'idle' | 'sending' | 'success' | 'failed'>('idle');
  const [activePatientUid, setActivePatientUid] = useState<string>('HS-001');
  const [activeAlertId, setActiveAlertId] = useState<string>('');

  // Real-time vital metrics states
  const [vitals, setVitals] = useState<any>({
    heartRate: '--',
    spo2: '--',
    temperature: '--',
    ecgSegment: []
  });
  
  const [patientDetails, setPatientDetails] = useState<any>({
    fullName: 'Shivani',
    age: 24,
    gender: 'Female',
    locationAddress: 'Flat 402, Block A, DLF Cyber City Road, Gachibowli, Hyderabad, Telangana, 500032, India'
  });

  const [aiSummary, setAiSummary] = useState<string>('');

  // 1. Listen for active emergency alerts
  useEffect(() => {
    if (!user) return;

    const isDoctor = profile?.role === 'doctor';
    
    if (isDoctor) {
      // Listen to the entire alerts node
      const alertsRef = ref(rtdb, 'alerts');
      const unsubAlerts = onValue(alertsRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          // Find first unresolved pending alert
          const activeId = Object.keys(val).find(key => {
            const a = val[key];
            return a && a.resolved !== true && (a.status === 'pending' || a.status === 'critical' || a.severity === 'critical');
          });
          if (activeId) {
            const activeAlert = val[activeId];
            setActiveAlertId(activeId);
            setActivePatientUid(activeAlert.patientId || activeId);
            setIsOpen(true);
          } else {
            setIsOpen(false);
            setActiveAlertId('');
          }
        } else {
          setIsOpen(false);
          setActiveAlertId('');
        }
      });
      return () => {
        unsubAlerts();
        alarmSound.stop();
      };
    } else {
      // Patient mode: listen only to own alert under alerts
      const myUid = user.uid || 'HS-001';
      setActivePatientUid(myUid);
      const alertsRef = ref(rtdb, 'alerts');
      const unsubAlert = onValue(alertsRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const activeId = Object.keys(val).find(key => {
            const a = val[key];
            return a && a.patientId === myUid && a.resolved !== true && (a.status === 'pending' || a.status === 'critical' || a.severity === 'critical');
          });
          if (activeId) {
            setActiveAlertId(activeId);
            setIsOpen(true);
          } else {
            setIsOpen(false);
            setActiveAlertId('');
          }
        } else {
          setIsOpen(false);
          setActiveAlertId('');
        }
      });
      return () => {
        unsubAlert();
        alarmSound.stop();
      };
    }
  }, [user, profile]);

  // 2. Listen to live readings & AI diagnosis for the active alert patient
  useEffect(() => {
    if (!isOpen || !activePatientUid) return;

    // Fetch demographics
    const profileRef = ref(rtdb, `patients/${activePatientUid}/profile`);
    const unsubProfile = onValue(profileRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setPatientDetails(prev => ({
          ...prev,
          fullName: val.fullName || val.name || prev.fullName,
          age: val.age || prev.age,
          gender: val.gender || prev.gender,
          locationAddress: val.locationAddress || val.address || prev.locationAddress
        }));
      }
    });

    // Listen to live readings (new unified path Patients/{uid}/liveReading)
    const liveReadingsRef = ref(rtdb, `Patients/${activePatientUid}/liveReading`);
    const unsubReadings = onValue(liveReadingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setVitals({
          heartRate: val.heartRate !== undefined ? val.heartRate : (val.bpm !== undefined ? val.bpm : '--'),
          spo2: val.spo2 !== undefined ? val.spo2 : '--',
          temperature: val.temperature !== undefined ? val.temperature : (val.temperature_c !== undefined ? val.temperature_c : '--'),
          ecgSegment: Array.isArray(val.ecgSegment) ? val.ecgSegment : (Array.isArray(val.ecgData) ? val.ecgData : [])
        });
        if (val.locationAddress) {
          setPatientDetails(prev => ({ ...prev, locationAddress: val.locationAddress }));
        }
      } else {
        // Fallback to legacy path
        const legacyRef = ref(rtdb, `patients/${activePatientUid}/liveVitals`);
        onValue(legacyRef, (legSnap) => {
          if (legSnap.exists()) {
            const val = legSnap.val();
            setVitals({
              heartRate: val.heartRate !== undefined ? val.heartRate : (val.bpm !== undefined ? val.bpm : '--'),
              spo2: val.spo2 !== undefined ? val.spo2 : '--',
              temperature: val.temperature !== undefined ? val.temperature : (val.temperature_c !== undefined ? val.temperature_c : '--'),
              ecgSegment: Array.isArray(val.ecgSegment) ? val.ecgSegment : (Array.isArray(val.ecgData) ? val.ecgData : [])
            });
          }
        }, { onlyOnce: true });
      }
    });

    // Listen to AI diagnosis
    const aiDiagRef = ref(rtdb, `patients/${activePatientUid}/aiDiagnosis`);
    const unsubAi = onValue(aiDiagRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setAiSummary(val.summary || val.result || val.diagnosis || '');
      }
    });

    return () => {
      unsubProfile();
      unsubReadings();
      unsubAi();
    };
  }, [isOpen, activePatientUid]);

  // Stage 7 & 8: 10-Second Countdown & Second Verification State Machine
  const [countdown, setCountdown] = useState<number>(10);

  useEffect(() => {
    if (isOpen) {
      setCountdown(10);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || dispatchStatus !== 'idle') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          console.log('[Emergency Modal Stage 7 & 8] 10-second countdown expired. Triggering Second Verification...');
          performSecondVerification();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, dispatchStatus, activePatientUid]);

  // Stage 8 & 9: Second Verification Logic & Automatic Escalation
  const performSecondVerification = async () => {
    try {
      console.log(`[Emergency Modal Stage 8] Fetching fresh readings for Round 2 evaluation on patient ${activePatientUid}...`);
      
      // Read fresh live telemetry directly from RTDB
      const freshSnap = await new Promise<any>((resolve) => {
        const liveReadingsRef = ref(rtdb, `Patients/${activePatientUid}/liveReading`);
        onValue(liveReadingsRef, (s) => resolve(s.val()), { onlyOnce: true });
      });

      const freshBpm = Number(freshSnap?.heartRate || freshSnap?.bpm || freshSnap?.BPM || vitals.heartRate || 0);
      const freshSpo2 = Number(freshSnap?.spo2 || freshSnap?.SpO2 || vitals.spo2 || 0);
      const freshTemp = Number(freshSnap?.temperature || freshSnap?.temperature_c || vitals.temperature || 0);

      const isStillCritical = (freshBpm > 140 || (freshBpm > 0 && freshBpm < 50)) || (freshSpo2 > 0 && freshSpo2 < 90) || (freshTemp > 40 || (freshTemp > 0 && freshTemp < 35));

      if (isStillCritical) {
        console.warn(`[Emergency Modal Stage 9] Patient vitals remain critical during Round 2 verification (BPM: ${freshBpm}, SpO2: ${freshSpo2}%). Automatically escalating dispatch!`);
        await handleDispatch(true); // Automatic escalation with verificationRound: 2
      } else {
        console.log(`[Emergency Modal Stage 8] Patient vitals have normalized during Round 2 verification. Resolving emergency.`);
        await handleIgnore();
      }
    } catch (err) {
      console.error('[Emergency Modal Stage 8] Second verification failed, executing automatic escalation fallback:', err);
      await handleDispatch(true);
    }
  };

  // Handle alarm sound mute/trigger state
  useEffect(() => {
    if (isOpen && !isMuted) {
      alarmSound.start();
    } else {
      alarmSound.stop();
    }
    return () => alarmSound.stop();
  }, [isOpen, isMuted]);

  if (!isOpen) return null;

  // Ignore alert action: Stage 6 - records ignoredAt and starts 10s re-verification instead of ignoring critical danger
  const handleIgnore = async () => {
    try {
      alarmSound.stop();
      setIsOpen(false);
      setDispatchStatus('idle');

      // Update RTDB record with ignored timestamp
      if (activeAlertId) {
        await update(ref(rtdb, `alerts/${activeAlertId}`), {
          ignored: true,
          ignoredAt: Date.now()
        });
      }

      // Clear alert from RTDB activeAlerts
      await set(ref(rtdb, `activeAlerts/${activePatientUid}`), null);

      if (activeAlertId) {
        await update(ref(rtdb, `alerts/${activeAlertId}`), {
          resolved: true,
          status: 'resolved'
        });
      }

      // Reset patient's emergency state in RTDB paths
      await update(ref(rtdb, `patients/${activePatientUid}/liveVitals`), {
        emergency: false,
        isAbnormal: false,
        condition: 'Normal',
        timestamp: Date.now()
      });
      await update(ref(rtdb, `Patients/${activePatientUid}/liveReading`), {
        isAbnormal: false,
        emergency: false,
        condition: 'Normal',
        timestamp: Date.now()
      });
      await update(ref(rtdb, `users/${activePatientUid}/liveReading`), {
        isAbnormal: false,
        emergency: false,
        condition: 'Normal',
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn("Failed to resolve and clear active alert:", e);
    }
  };

  // Dispatch emergency action: Stage 5 - calls backend API
  const handleDispatch = async (isAutoEscalation = false) => {
    try {
      setDispatchStatus('sending');

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${apiUrl}/api/emergency/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientUid: activePatientUid,
          verificationRound: isAutoEscalation ? 2 : 1,
          aiSummary: aiSummary || "Persistent critical telemetry detected.",
          reason: "Critical Cardiac Telemetry Alert"
        })
      });

      if (res.ok) {
        setDispatchStatus('success');
        
        if (activeAlertId) {
          await update(ref(rtdb, `alerts/${activeAlertId}`), {
            resolved: true,
            status: 'dispatched',
            verificationRound: isAutoEscalation ? 2 : 1
          });
        }

        setTimeout(() => {
          handleIgnore(); // Clear alert & close modal after success
        }, 2000);
      } else {
        setDispatchStatus('failed');
      }
    } catch (error) {
      console.error("Failed to execute Twilio dispatch:", error);
      setDispatchStatus('failed');
    }
  };

  const isFrozen = dispatchStatus === 'sending' || dispatchStatus === 'success';

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-[500px] bg-slate-900 border-2 border-red-500/40 rounded-[28px] overflow-hidden shadow-[0_25px_60px_rgba(239,68,68,0.3)] flex flex-col text-slate-100">
        
        {/* Compact Header Bar */}
        <div className="bg-gradient-to-r from-red-600 via-red-500 to-rose-600 px-5 py-3.5 flex items-center justify-between border-b border-red-500/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center relative">
              <AlertOctagon className="w-5 h-5 text-white" />
              <div className="w-8 h-8 bg-white/20 rounded-full animate-ping absolute inset-0" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-white">🚨 Critical Health Alert</span>
                <span className="px-2 py-0.5 bg-black/40 text-amber-300 font-mono font-bold text-[10px] rounded-full border border-amber-400/30">
                  Auto-Check in {countdown}s
                </span>
              </div>
            </div>
          </div>
          <button 
            disabled={isFrozen}
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white disabled:opacity-50"
            title={isMuted ? "Unmute Alarm" : "Mute Alarm"}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Compact Content Body */}
        <div className="p-5 flex flex-col gap-3.5 overflow-y-auto max-h-[70vh]">
          
          {/* Patient Quick Info & Emergency Reason */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-400">Patient: <strong className="text-white">{patientDetails.fullName}</strong> ({patientDetails.age} yrs, {patientDetails.gender})</span>
              <span className="text-red-400 uppercase text-[10px] font-black tracking-wider px-2 py-0.5 bg-red-950/60 rounded-md border border-red-500/30">HIGH RISK</span>
            </div>
            <p className="text-[11px] font-bold text-red-300 flex items-center gap-1.5 mt-0.5">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>Reason: Critical Biometric & Cardiac Triage Anomaly</span>
            </p>
          </div>

          {/* Essential Vitals Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            
            {/* Heart Rate */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-2.5 text-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Heart Rate</span>
              <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                <span className="text-xl font-black text-red-400">{vitals.heartRate}</span>
                <span className="text-[9px] font-bold text-slate-500 uppercase">BPM</span>
              </div>
            </div>

            {/* SpO2 */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-2.5 text-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">SpO2</span>
              <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                <span className="text-xl font-black text-sky-400">{vitals.spo2}</span>
                <span className="text-[9px] font-bold text-slate-500">%</span>
              </div>
            </div>

            {/* Temperature */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-2.5 text-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Temperature</span>
              <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                <span className="text-xl font-black text-amber-400">{vitals.temperature}</span>
                <span className="text-[9px] font-bold text-slate-500">°C</span>
              </div>
            </div>

          </div>

          {/* AI Medical Summary (2-3 lines compact) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[9px] uppercase tracking-widest font-black">AI Clinical Medical Summary</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug line-clamp-3 italic">
              {aiSummary || "Clinical biometrics indicate acute vital instability. Persistent tachyarrhythmia or hypoxia risk detected. Immediate medical evaluation recommended."}
            </p>
          </div>

        </div>

        {/* Action Buttons Footer (Always Sticky & Visible) */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center gap-2.5 shrink-0">
          
          <button
            type="button"
            disabled={isFrozen}
            onClick={handleIgnore}
            className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-emerald-400 font-black uppercase text-[11px] tracking-wider rounded-xl transition-all border border-slate-700/60 active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
          >
            <span>🟢 Ignore</span>
          </button>

          <button
            type="button"
            disabled={isFrozen}
            onClick={() => handleDispatch(false)}
            className="flex-1 py-2.5 px-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-black uppercase text-[11px] tracking-wider rounded-xl shadow-[0_6px_18px_rgba(239,68,68,0.3)] transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-60 cursor-pointer"
          >
            {dispatchStatus === 'sending' ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Dispatching...</span>
              </>
            ) : dispatchStatus === 'success' ? (
              <span>Dispatched!</span>
            ) : dispatchStatus === 'failed' ? (
              <span>Retry Dispatch</span>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4" />
                <span>🔴 Emergency Dispatch</span>
              </>
            )}
          </button>

        </div>

      </div>
    </div>
  );
}
