// Emergency Service for HeartSync Medical Hub

import { ref, set, update, get } from 'firebase/database';
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { rtdb, db } from '../../shared/lib/firebase';

// Trigger a full emergency alert and update doctor's active alerts map
export const triggerEmergency = async (
  patientId: string,
  doctorId: string,
  data: {
    patientName: string;
    age?: number | null;
    heartRate: number;
    spo2: number;
    temperature_c: number;
    humidity: number;
    emergency: boolean;
    isAbnormal: boolean;
    timestamp: number;
  }
) => {
  try {
    const timestamp = Date.now();
    const alertId = `ALERT-${timestamp}`;
    const alertRef = ref(rtdb, `alerts/${alertId}`);
    await set(alertRef, {
      patientId,
      doctorId,
      status: 'critical',
      patientName: data.patientName,
      age: data.age || null,
      vitals: {
        heartRate: data.heartRate,
        spo2: data.spo2,
        temperature: data.temperature_c,
        humidity: data.humidity
      },
      timestamp,
      resolved: false
    });
  } catch (error) {
    console.error('Trigger Emergency failed:', error);
  }
};

// Resolve an active emergency alert
export const resolveEmergency = async (patientId: string, doctorId?: string, alertId?: string) => {
  try {
    const alertsRef = ref(rtdb, 'alerts');
    const snap = await get(alertsRef);
    if (snap.exists()) {
      const alerts = snap.val();
      const updates: any = {};
      for (const key of Object.keys(alerts)) {
        if (alerts[key].patientId === patientId && !alerts[key].resolved) {
          updates[`alerts/${key}/resolved`] = true;
          updates[`alerts/${key}/resolvedAt`] = Date.now();
          updates[`alerts/${key}/status`] = 'resolved';
        }
      }
      if (Object.keys(updates).length > 0) {
        await update(ref(rtdb), updates);
      }
    }
  } catch (error) {
    console.error('Resolve Emergency failed:', error);
  }
};

// Dispatch an ambulance from the doctor interface
export const dispatchAmbulance = async (
  patientId: string,
  doctorId: string,
  patientData: any
) => {
  try {
    const dispatchId = `DISPATCH-${Date.now()}`;
    const dispatchRef = ref(rtdb, `ambulanceRequests/${dispatchId}`);
    
    // Default location fallback matching user specification coordinates
    const lat = patientData?.location?.lat || 17.425834775919437;
    const lng = patientData?.location?.lng || 78.32965949351346;
    
    await set(dispatchRef, {
      patientId,
      doctorId,
      patientName: patientData?.fullName || patientData?.name || 'Active Patient',
      status: 'dispatched',
      location: { lat, lng },
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Ambulance Dispatch failed:', error);
  }
};

class WebAudioSiren {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;

  start() {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        return;
      }
      
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.osc1 = this.ctx.createOscillator();
      this.osc2 = this.ctx.createOscillator();
      this.gainNode = this.ctx.createGain();

      this.osc1.type = 'sawtooth';
      this.osc1.frequency.setValueAtTime(440, this.ctx.currentTime);

      this.osc2.type = 'sine';
      this.osc2.frequency.setValueAtTime(2, this.ctx.currentTime); // LFO

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(150, this.ctx.currentTime); // sweep range

      this.osc2.connect(lfoGain);
      lfoGain.connect(this.osc1.frequency);

      this.gainNode.gain.setValueAtTime(0.15, this.ctx.currentTime);

      this.osc1.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this.osc1.start();
      this.osc2.start();
    } catch (e) {
      console.warn('Audio Context start failed', e);
    }
  }

  stop() {
    try {
      if (this.osc1) {
        this.osc1.stop();
        this.osc1.disconnect();
        this.osc1 = null;
      }
      if (this.osc2) {
        this.osc2.stop();
        this.osc2.disconnect();
        this.osc2 = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      if (this.ctx) {
        if (this.ctx.state === 'running') {
          this.ctx.suspend();
        }
      }
    } catch (e) {
      // Ignore stop errors
    }
  }
}

const sirenSynth = new WebAudioSiren();
let isPlaying = false;

export const playSiren = () => {
  if (isPlaying) return;
  isPlaying = true;
  sirenSynth.start();
};

export const stopSiren = () => {
  isPlaying = false;
  sirenSynth.stop();
};

export const sendRealtimeWhatsAppEmergency = async (vitals: any, location: any) => {
  const name = vitals?.patientName || 'Active Patient';
  
  const getWholeNumber = (val: any, fallback: number = 0): number => {
    if (val === undefined || val === null || val === '') return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : Math.round(num);
  };

  const hr = getWholeNumber(vitals?.bpm !== undefined ? vitals?.bpm : vitals?.heartRate, 0);
  const spo2 = getWholeNumber(vitals?.spo2, 0);
  const age = vitals?.patientAge || vitals?.age || '24';
  const temp = getWholeNumber(vitals?.temperature_c !== undefined ? vitals?.temperature_c : (vitals?.temperature !== undefined ? vitals?.temperature : (vitals?.temp !== undefined ? vitals?.temp : 0)), 0);
  const humidity = getWholeNumber(vitals?.humidity, 0);
  const condition = vitals?.condition || 'CRITICAL';
  const serial = vitals?.serialNumber || vitals?.patientId || 'HS-001';
  const ts = vitals?.timestamp || Date.now();
  
  // 1. Fetch AI diagnosis and ECG status dynamically from Firebase
  let diagnosis = 'Critical Condition Detected';
  try {
    const analysisSnap = await getDoc(doc(db, 'aiAnalysis', serial));
    if (analysisSnap.exists()) {
      const data = analysisSnap.data();
      diagnosis = data?.interpretation || data?.result || data?.diagnosis || 'Critical Condition Detected';
    } else {
      // Check RTDB fallback
      const rtdbDiagRef = ref(rtdb, `patients/${serial}/aiDiagnosis`);
      const rtdbDiagSnap = await get(rtdbDiagRef);
      if (rtdbDiagSnap.exists()) {
        diagnosis = rtdbDiagSnap.val()?.result || 'Critical Condition Detected';
      }
    }
  } catch (err) {
    console.warn("Failed to fetch diagnosis:", err);
  }

  // 2. Resolve GPS coordinates from location parameter or database (NO browser geolocation)
  let latitude = 17.425834775919437;
  let longitude = 78.32965949351346;

  if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
    latitude = location.lat;
    longitude = location.lng;
  } else if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    latitude = location.latitude;
    longitude = location.longitude;
  } else {
    // Read directly from Firebase Realtime Database
    try {
      const locRef = ref(rtdb, `patients/${serial}/location`);
      const locSnap = await get(locRef);
      if (locSnap.exists()) {
        const val = locSnap.val();
        if (val && typeof val.lat === 'number' && typeof val.lng === 'number') {
          latitude = val.lat;
          longitude = val.lng;
        }
      } else {
        const fallbackLocRef = ref(rtdb, `liveHealthMetrics/${serial}/location`);
        const fallbackLocSnap = await get(fallbackLocRef);
        if (fallbackLocSnap.exists()) {
          const val = fallbackLocSnap.val();
          if (val && typeof val.lat === 'number' && typeof val.lng === 'number') {
            latitude = val.lat;
            longitude = val.lng;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to retrieve patient coordinates from Firebase RTDB:", e);
    }
  }

  // 3. Make POST request to Node.js backend API
  try {
    console.log(`[Frontend Service] Sending alert request to backend API...`);
    const response = await fetch('http://localhost:5000/api/emergency/send-alert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        patientName: name,
        age: age,
        heartRate: hr,
        spo2: spo2,
        temperature_c: temp,
        humidity: humidity,
        condition: condition,
        ecgStatus: 'CRITICAL',
        diagnosis: diagnosis,
        latitude: latitude,
        longitude: longitude,
        patientId: serial,
        timestamp: ts,
        doctorTriggeredAlertStatus: 'SENT'
      })
    });
    const resData = await response.json();
    console.log('[Frontend Service] Backend API Response:', resData);
  } catch (err) {
    console.error('[Frontend Service] Failed to contact backend emergency API:', err);
  }
};

export const callAmbulanceAPI = async () => {
  try {
    console.log('[Frontend Service] Sending call ambulance request to backend...');
    const response = await fetch('http://localhost:5000/api/emergency/call-ambulance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const resData = await response.json();
    console.log('[Frontend Service] Call Ambulance API Response:', resData);
    return resData;
  } catch (err) {
    console.error('[Frontend Service] Failed to trigger backend call-ambulance API:', err);
    return { success: false, error: (err as Error).message };
  }
};

export const emergencyService = {
  triggerEmergency,
  resolveEmergency,
  dispatchAmbulance,
  playSiren,
  stopSiren,
  sendRealtimeWhatsAppEmergency,
  callAmbulanceAPI,
};

export default {
  triggerEmergency,
  resolveEmergency,
  dispatchAmbulance,
  playSiren,
  stopSiren,
  sendRealtimeWhatsAppEmergency,
  callAmbulanceAPI,
};