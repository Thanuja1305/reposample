import React, { useEffect, useState, useRef } from 'react';
import { ref, onValue, set, update } from 'firebase/database';
import { rtdb } from '../../shared/lib/firebase';
import { useAuth } from '../context/AuthContext';
import { AlertOctagon, Volume2, VolumeX, ShieldAlert, Sparkles, Activity } from 'lucide-react';

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
    } catch (e) {}
  }
}

const alarmSound = new WebAudioAlarm();

// 2D Canvas Drawing Component for real-time scrolling ECG waveforms
const ECGCanvasChart: React.FC<{ data: number[] }> = ({ data }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
  
  // Use logged-in patient's uid, or HS-001 for demo compatibility
  const patientUid = profile?.role === 'patient' && user?.uid ? user.uid : 'HS-001';

  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<'idle' | 'sending' | 'success' | 'failed'>('idle');

  // Real-time vital metrics states
  const [vitals, setVitals] = useState<any>({
    heartRate: '--',
    spo2: '--',
    temperature: '--',
    ecgSegment: []
  });
  
  const [aiSummary, setAiSummary] = useState<string>('');

  useEffect(() => {
    if (!patientUid) return;

    // 1. Listen to activeAlerts/{patientUid} path
    const alertRef = ref(rtdb, `activeAlerts/${patientUid}`);
    const unsubAlert = onSnapshotRef(alertRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        if (val && val.resolved !== true) {
          setIsOpen(true);
        } else {
          setIsOpen(false);
        }
      } else {
        setIsOpen(false);
      }
    });

    // Helper function for typing safety on rtdb listeners
    function onSnapshotRef(dbRef: any, callback: (snap: any) => void) {
      return onValue(dbRef, callback);
    }

    // 2. Listen to liveReadings/{patientUid} path for real-time modal details
    const liveReadingsRef = ref(rtdb, `liveReadings/${patientUid}`);
    const unsubReadings = onValue(liveReadingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setVitals({
          heartRate: val.heartRate !== undefined ? val.heartRate : '--',
          spo2: val.spo2 !== undefined ? val.spo2 : '--',
          temperature: val.temperature !== undefined ? val.temperature : '--',
          ecgSegment: Array.isArray(val.ecgSegment) ? val.ecgSegment : (Array.isArray(val.latestEcgSegment) ? val.latestEcgSegment : [])
        });
        setAiSummary(val.latestAiReportSummary || val.summary || '');
      }
    });

    return () => {
      unsubAlert();
      unsubReadings();
      alarmSound.stop();
    };
  }, [patientUid]);

  // Handle audio play/stop on alert pop-up trigger
  useEffect(() => {
    if (isOpen && !isMuted) {
      alarmSound.start();
    } else {
      alarmSound.stop();
    }
    return () => alarmSound.stop();
  }, [isOpen, isMuted]);

  if (!isOpen) return null;

  // Ignore alert action: mute audio, clear activeAlerts path, and reset RTDB status
  const handleIgnore = async () => {
    try {
      alarmSound.stop();
      setIsOpen(false);
      setDispatchStatus('idle');

      // Clear alert from RTDB activeAlerts
      await set(ref(rtdb, `activeAlerts/${patientUid}`), null);

      // Reset patient's emergency state in RTDB paths
      await update(ref(rtdb, `patients/${patientUid}/liveVitals`), {
        emergency: false,
        isAbnormal: false,
        condition: 'Normal',
        timestamp: Date.now()
      });
      await update(ref(rtdb, `liveReadings/${patientUid}`), {
        condition: 'Normal',
        timestamp: Date.now()
      });

    } catch (e) {
      console.warn("Failed to resolve and clear active alert:", e);
    }
  };

  // Dispatch emergency action: calls backend API and plays spinner
  const handleDispatch = async () => {
    try {
      setDispatchStatus('sending');

      // Make dispatch POST request to backend API
      const res = await fetch('http://localhost:5000/api/emergency/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ patientUid })
      });

      if (res.ok) {
        setDispatchStatus('success');
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
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border-2 border-red-500/30 rounded-[32px] overflow-hidden shadow-[0_30px_70px_rgba(239,68,68,0.25)] flex flex-col text-slate-100">
        
        {/* Header bar */}
        <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-4 flex items-center justify-between border-b border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center animate-ping absolute" />
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center relative">
              <AlertOctagon className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-100/80">Critical Triage Warning</span>
              <h2 className="text-base font-black tracking-tight leading-none text-white uppercase italic">HeartSync Emergency Alert</h2>
            </div>
          </div>
          <button 
            disabled={isFrozen}
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white disabled:opacity-50"
            title={isMuted ? "Unmute Alarm" : "Mute Alarm"}
          >
            {isMuted ? <VolumeX className="w-5.5 h-5.5" /> : <Volume2 className="w-5.5 h-5.5" />}
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[80vh]">
          
          {/* AI Assessment summary card */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-1">
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-widest font-black">Clinical Decision Support AI</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed italic">
              {aiSummary || "Clinical biometrics show significant variations. Continuous live readings are under telemetry monitoring. Medical assessment is strongly advised."}
            </p>
          </div>

          {/* Real-time parameters layout */}
          <div className="grid grid-cols-3 gap-3">
            
            {/* Heart Rate */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-3 text-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Heart Rate</span>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-2xl font-black text-red-400 tracking-tight">{vitals.heartRate}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">BPM</span>
              </div>
            </div>

            {/* SpO2 */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-3 text-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">SpO2</span>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-2xl font-black text-sky-400 tracking-tight">{vitals.spo2}</span>
                <span className="text-[10px] font-bold text-slate-500">%</span>
              </div>
            </div>

            {/* Temperature */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-3 text-center">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Temperature</span>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-2xl font-black text-amber-400 tracking-tight">{vitals.temperature}</span>
                <span className="text-[10px] font-bold text-slate-500">°C</span>
              </div>
            </div>

          </div>

          {/* ECG Waveform Canvas Chart */}
          <ECGCanvasChart data={vitals.ecgSegment} />

          {/* Overlay actions bar */}
          <div className="flex items-center gap-3 mt-2 border-t border-slate-800/80 pt-4">
            
            <button
              type="button"
              disabled={isFrozen}
              onClick={handleIgnore}
              className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-750 text-slate-200 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all border border-slate-700/60 active:scale-95 disabled:opacity-50"
            >
              Ignore Alert
            </button>

            <button
              type="button"
              disabled={isFrozen}
              onClick={handleDispatch}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-black uppercase text-[10px] tracking-widest rounded-xl shadow-[0_8px_20px_rgba(239,68,68,0.2)] transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
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
                  <span>EMERGENCY DISPATCH</span>
                </>
              )}
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}
