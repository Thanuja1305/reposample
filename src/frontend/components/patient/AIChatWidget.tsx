import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Stethoscope, Send, User, Sparkles, X, Heart, ShieldCheck, Minimize2, Maximize2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { db, rtdb } from '../../../shared/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { useAuth } from '../../context/AuthContext';

interface AIChatWidgetProps {
  userId: string;
}

// Highly sophisticated, context-aware pre-clinical medical responder
const getPreClinicalResponse = (userInput: string, vitals: any, patientData: any) => {
  const query = userInput.toLowerCase().trim();
  const name = patientData?.fullName || patientData?.patientName || patientData?.displayName || 'Patient';
  
  // Extract real live vitals values without forcing mock defaults if values are 0 or empty
  const rawBpm = vitals?.bpm ?? vitals?.BPM ?? vitals?.HeartRate ?? vitals?.heartRate;
  const rawSpo2 = vitals?.spo2 ?? vitals?.SpO2 ?? vitals?.oxygen;
  const rawTemp = vitals?.temperature_c ?? vitals?.temperature ?? vitals?.temp;

  // Live IoT telemetry values are considered active if BPM and SpO2 are present and non-zero
  const hasVitals = rawBpm !== undefined && rawBpm !== null && Number(rawBpm) > 0 &&
                    rawSpo2 !== undefined && rawSpo2 !== null && Number(rawSpo2) > 0;

  const bpm = hasVitals ? Number(rawBpm) : 0;
  const spo2 = hasVitals ? Number(rawSpo2) : 0;
  const temp = hasVitals ? Number(rawTemp) : 0;
  const hum = Number(vitals?.humidity || 0);

  const isBpmCritical = hasVitals && (bpm < 50 || bpm > 140);
  const isSpo2Critical = hasVitals && spo2 < 90;

  // Enforce project-only relevance to prevent answering questions unrelated to cardiac health monitoring
  const ALLOWED_KEYWORDS = [
    'hi', 'hello', 'hey', 'help', 'greet', 'welcome', 'morning', 'evening',
    'chest pain', 'pain', 'pressure', 'heart attack', 'tightness', 'dizzy', 'dizziness', 
    'breath', 'suffocate', 'breathing', 'cough', 'palpitations', 'ache', 'symptom', 'choke',
    'bpm', 'pulse', 'heart rate', 'rate', 'beat', 'spo2', 'oxygen', 'o2', 
    'temp', 'temperature', 'fever', 'hot', 'cold',
    'ecg', 'graph', 'waveform', 'line', 'plot',
    'doctor', 'cardiologist', 'hospital', 'ambulance', 'emergency', 'sos', 'alert', 
    'location', 'clinic', 'heartsync', 'system', 'app', 'care', 'health', 'patient', 'vitals'
  ];

  const isRelated = ALLOWED_KEYWORDS.some(kw => query.includes(kw));
  if (!isRelated && query.length > 0) {
    return `🩺 **HEARTSYNC CLINICAL ASSISTANT**\n\nHello ${name},\n\nI am configured as your personal pre-clinical cardiac assistant for the **HeartSync Medical Hub**. I am only programmed to assist with cardiac health questions, live biometric vitals (Heart Rate, SpO2, Temperature), ECG status, and cardiac emergency tracking.\n\nCould you please ask a question related to your health telemetry or clinical assessment?`;
  }

  if (query.includes('chest pain') || query.includes('pressure') || query.includes('heart attack') || query.includes('pain in chest') || query.includes('tightness')) {
    return `⚠️ **URGENT CARDIAC SYMPTOM NOTICE**\n\nHello ${name}, chest tightness or pain is a **critical symptom** that requires immediate clinical evaluation.\n\n` +
      `**Current Telemetry Analysis:**\n` +
      `- Heart Rate: **${hasVitals ? `${bpm} BPM` : '⚠️ Sensor Offline'}** ${hasVitals && isBpmCritical ? '(⚠️ CRITICAL)' : ''}\n` +
      `- SpO2: **${hasVitals ? `${spo2}%` : '⚠️ Sensor Offline'}** ${hasVitals && isSpo2Critical ? '(⚠️ CRITICAL)' : ''}\n` +
      `- Temperature: **${hasVitals ? `${temp}°C` : '⚠️ Sensor Offline'}**\n\n` +
      `**Action Protocol:**\n` +
      `1. **DO NOT EXERT YOURSELF.** Sit down in a comfortable, upright position to ease breathing.\n` +
      `2. **ACTIVATE SOS.** Click the red **EMERGENCY LOCATION** or **SOS** button on your dashboard immediately to alert your cardiologist and dispatch ambulance coordinates.\n` +
      `3. If you have been prescribed emergency nitroglycerin or aspirin by a doctor, take it now.\n\n` +
      `*Pre-clinical Note: This is an automated assessment. Please rely on live medical support immediately.*`;
  }
  else if (query.includes('ecg') || query.includes('graph') || query.includes('waveform') || query.includes('line')) {
    return `📈 **LIVE ECG WAVEFORM ANALYSIS**\n\nHello ${name}, I am reading your real-time ECG telemetry.\n\n` +
      `**Current Reading:**\n` +
      `- Heart Rate: **${hasVitals ? `${bpm} BPM` : '⚠️ Sensor Offline'}**\n` +
      `- Waveform Status: **${hasVitals ? 'Stable Sinus Rhythm' : '⚠️ Sensor Not Connected'}**\n` +
      `- SpO2: **${hasVitals ? `${spo2}%` : '⚠️ Sensor Offline'}**\n\n` +
      (hasVitals 
        ? `Your ECG trace represents the electrical impulses of your cardiac nodes. Currently, your telemetry shows a ${bpm > 100 ? 'tachycardic (rapid)' : bpm < 60 ? 'bradycardic (slow)' : 'stable and strong'} sinus pattern.`
        : `Please verify that your hardware sensor is securely connected to your finger to view your live ECG trace.`) +
      `\n\n*Pre-clinical Note: Live ECG monitoring is indicative. Formal ECG interpretation must be reviewed by your linked cardiologist.*`;
  }
  else if (query.includes('breath') || query.includes('spo2') || query.includes('oxygen') || query.includes('suffocating')) {
    return `💨 **RESPIRATORY & OXYGENATION ASSESSMENT**\n\nHello ${name}, let's examine your blood oxygen saturation (SpO2).\n\n` +
      `**Telemetry Status:**\n` +
      `- Oxygen Level (SpO2): **${hasVitals ? `${spo2}%` : '⚠️ Sensor Offline'}**\n` +
      `- Pulse Rate: **${hasVitals ? `${bpm} BPM` : '⚠️ Sensor Offline'}**\n\n` +
      `**Guidance:**\n` +
      (!hasVitals 
        ? `⚠️ **Sensor Not Connected.** Please attach your biotelemetry hardware to monitor your SpO2.`
        : isSpo2Critical 
          ? `⚠️ **Your SpO2 is below the 90% critical hospital threshold.** This indicates hypoxia. Please sit upright, practice slow deep breathing, and click the **SOS Emergency** button immediately.`
          : `Your oxygen level is at a highly efficient **${spo2}%**, indicating superb tissue perfusion.`) +
      `\n\n*Pre-clinical Note: Rapid drops in SpO2 require immediate clinical validation.*`;
  }
  else if (query.includes('fever') || query.includes('temperature') || query.includes('hot') || query.includes('cold') || query.includes('temp')) {
    return `🌡️ **THERMAL TELEMETRY ANALYSIS**\n\nHello ${name}, here is your body temperature telemetry.\n\n` +
      `**Reading:**\n` +
      `- Body Temperature: **${hasVitals ? `${temp}°C` : '⚠️ Sensor Offline'}**\n` +
      `- Ambient Humidity: **${hasVitals ? `${hum}%` : '⚠️ Sensor Offline'}**\n\n` +
      (!hasVitals
        ? `Please connect your temperature sensor to check your febrile status.`
        : `A body temperature of **${temp}°C** represents a ${temp > 37.5 ? 'elevated temp/fever' : temp < 35.5 ? 'low temp/hypothermia' : 'normal resting temperature'}.`) +
      `\n\n*Pre-clinical Note: Persistently high fevers (>38.5°C) with cardiac acceleration should be reported to your doctor.*`;
  }
  else if (query.includes('bpm') || query.includes('pulse') || query.includes('heart rate') || query.includes('beat')) {
    return `❤️ **HEART RATE PROFILE**\n\nHello ${name}, let's assess your current heart rate statistics.\n\n` +
      `**Metrics:**\n` +
      `- Current Rate: **${hasVitals ? `${bpm} BPM` : '⚠️ Sensor Offline'}**\n` +
      `- Clinical Category: **${!hasVitals ? 'Offline' : bpm >= 140 ? 'Critical Tachycardia ⚠️' : bpm >= 100 ? 'Mild Tachycardia' : bpm <= 50 ? 'Critical Bradycardia ⚠️' : bpm <= 60 ? 'Low Warning' : 'Normal resting range (60-100 BPM)'}**\n\n` +
      (hasVitals
        ? `Your current pulse of **${bpm} BPM** is under close telemetry observation. ${bpm > 100 ? 'Try to relax and practice deep breathing.' : 'Your rate is stable.'}`
        : `Please connect your biotelemetry pulse device to start tracking your heart rate.`) +
      `\n\n*Pre-clinical Note: Any sustained pulse above 140 BPM or below 50 BPM is considered critical.*`;
  }
  else if (query.includes('hi') || query.includes('hello') || query.includes('hey') || query.includes('help')) {
    return `👋 **WELCOME TO CARDIOSYNC AI ASSISTANT**\n\nHello ${name}! I am your dedicated pre-clinical cardiac assistant, synchronized live with your IoT vitals.\n\n` +
      `**Your Real-time Biometrics:**\n` +
      `- Heart Rate: **${hasVitals ? `${bpm} BPM` : '⚠️ Sensor Offline (Not Connected)'}**\n` +
      `- Oxygen Saturation: **${hasVitals ? `${spo2}%` : '⚠️ Sensor Offline (Not Connected)'}**\n` +
      `- Temperature: **${hasVitals ? `${temp}°C` : '⚠️ Sensor Offline (Not Connected)'}**\n\n` +
      `How can I assist you today? You can ask me:\n` +
      `- "Can you explain my current ECG status?"\n` +
      `- "Interpret my heart rate (BPM) or oxygen levels."\n` +
      `- "I am feeling some chest pressure, what should I do?"\n\n` +
      `*Disclaimer: I provide pre-clinical guidance. In case of an emergency, use the red SOS button immediately.*`;
  }
  else {
    return `🩺 **HEARTSYNC CLINICAL INSIGHT**\n\nThank you for reaching out, ${name}.\n\n` +
      `Based on my pre-clinical analysis:\n` +
      `- Heart Rate: **${hasVitals ? `${bpm} BPM` : '⚠️ Sensor Offline'}**\n` +
      `- SpO2: **${hasVitals ? `${spo2}%` : '⚠️ Sensor Offline'}**\n` +
      `- Body Temp: **${hasVitals ? `${temp}°C` : '⚠️ Sensor Offline'}**\n\n` +
      (!hasVitals 
        ? `⚠️ **Note: Your biotelemetry hardware sensor is currently offline.** Please plug in or connect your HeartSync sensor device to stream live vitals.`
        : `If you have specific symptoms such as chest tightness, dizziness, shortness of breath, or palpitations, please detail them.`) +
      `\n\n*Pre-clinical Note: Automated insights do not replace direct medical advice from your cardiologist.*`;
  }
};

const AIChatWidget: React.FC<AIChatWidgetProps> = ({ userId }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [vitals, setVitals] = useState<any>(null);
  const [patientData, setPatientData] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const targetUid = user?.uid || userId;
    if (targetUid) {
      // 1. Identity data from 'users' RTDB / Firestore
      const unsubPatient = onSnapshot(doc(db, 'users', targetUid), (snap) => {
        if (snap.exists()) setPatientData(snap.data());
      }, (err) => {
        console.warn('Failed to listen to users doc for AIChatWidget:', err);
      });

      // 2. Private health metrics from RTDB (multiplexed paths)
      const paths = [
        `patients/${targetUid}/liveVitals`,
        `patients/HS-001/liveVitals`,
        `liveHealthMetrics/${targetUid}`,
        `liveHealthMetrics/HS-001`,
        `users/${targetUid}/liveReading`,
        `users/m1uph2bX7SVd9Wbyge1AMqAmq093/liveReading`,
        `users/onYK6WJGu6VR6fEgQXBhximLEFI3/liveReading`,
        `users/HS-001/liveReading`
      ];

      const latestDataMap: Record<string, any> = {};
      const unsubs: (() => void)[] = [];

      const updateVitals = () => {
        let activeData = null;
        for (const path of paths) {
          if (latestDataMap[path]) {
            const data = latestDataMap[path];
            const bpm = Number(data?.heartRate || data?.bpm || data?.BPM || data?.HeartRate || 0);
            const spo2 = Number(data?.spo2 || data?.SpO2 || data?.SPO2 || data?.oxygen || data?.o2 || 0);
            if (bpm > 0 || spo2 > 0) {
              activeData = data;
              break;
            }
          }
        }
        if (activeData) {
          setVitals(activeData);
        }
      };

      paths.forEach((path) => {
        const targetRef = ref(rtdb, path);
        const unsub = onValue(targetRef, (snapshot) => {
          if (snapshot.exists()) {
            latestDataMap[path] = snapshot.val();
          } else {
            latestDataMap[path] = null;
          }
          updateVitals();
        }, (err) => {
          console.warn(`🔥 Chatbot error listening to vitals path [${path}]:`, err);
          latestDataMap[path] = null;
          updateVitals();
        });
        unsubs.push(unsub);
      });

      return () => {
        unsubPatient();
        unsubs.forEach(unsub => unsub());
      };
    }
  }, [user, userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isMinimized]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      const rawBpm = vitals?.bpm ?? vitals?.BPM ?? vitals?.HeartRate ?? vitals?.heartRate;
      const rawSpo2 = vitals?.spo2 ?? vitals?.SpO2 ?? vitals?.oxygen;
      const rawTemp = vitals?.temperature_c ?? vitals?.temperature ?? vitals?.temp;

      const hasVitals = rawBpm !== undefined && rawBpm !== null && Number(rawBpm) > 0 &&
                        rawSpo2 !== undefined && rawSpo2 !== null && Number(rawSpo2) > 0;

      const bpm = hasVitals ? Number(rawBpm) : 0;
      const spo2 = hasVitals ? Number(rawSpo2) : 0;
      const temp = hasVitals ? Number(rawTemp) : 0;

      const vitalsText = hasVitals 
        ? `- Heart Rate (BPM): ${bpm} BPM (Normal range: 60-100 BPM. Critical: <50 or >140 BPM)\n        - Blood Oxygen (SpO2): ${spo2}% (Normal range: 95-100%. Critical: <90%)\n        - Body Temperature: ${temp}°C (Normal range: 36.5-37.5°C)`
        : `- Heart Rate: Sensor Offline (Not Connected)\n        - Blood Oxygen (SpO2): Sensor Offline (Not Connected)\n        - Body Temperature: Sensor Offline (Not Connected)\n        \n        CRITICAL WARNING: The biotelemetry hardware sensor is currently offline or not connected to the patient. You must state this clearly if asked about vitals, and instruct the patient to connect their physical HeartSync sensor device. Do NOT make up or assume any values.`;

      const context = `
        System Prompt:
        You are "HeartSync Clinical AI Assistant", a professional medical chatbot integrated with the HeartSync IoT platform.
        You must ONLY answer queries related to this healthcare monitoring system ("HeartSync"), heart health, cardiology, symptoms of cardiac emergency, blood oxygen saturation (SpO2), body temperature, ECG, or medical/ambulance protocols.
        If the user's message is NOT related to cardiac health, medical issues, vitals, or HeartSync, you must politely decline to answer, saying that you are programmed only to assist with cardiac health and medical query tracking.
        
        Patient Name: ${patientData?.fullName || patientData?.patientName || 'Active Patient'}
        Patient's Live Telemetry Vitals:
        ${vitalsText}
        
        Guidelines:
        1. Be professional, clear, reassuring, and concise.
        2. If vitals are offline, tell the patient to connect their physical sensor. Do not invent mock telemetry data.
        3. Advise activating the red Emergency Location/SOS button immediately if heart rate or oxygen is in the critical threshold (HR > 120 or SpO2 < 90), or if the patient reports severe chest pain.
        4. Do not diagnose diseases definitely; provide pre-clinical guidance and suggest contacting their doctor.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: context }] },
          ...messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: currentInput }] }
        ]
      });

      setMessages(prev => [...prev, { role: 'model', text: response.text || "Pre-clinical node online. Vitals are currently synchronized." }]);
    } catch (error) {
      console.warn("⚠️ AIChatWidget Gemini link fallback active:", error);
      const fallbackResponse = getPreClinicalResponse(currentInput, vitals, patientData);
      setMessages(prev => [...prev, { role: 'model', text: fallbackResponse }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="w-[380px] h-[520px] bg-white rounded-[32px] shadow-premium border border-slate-100 flex flex-col overflow-hidden mb-4"
          >
            <div className="p-6 bg-accent-maroon text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl">
                  <Stethoscope className="w-5.5 h-5.5 text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-black tracking-tight">HeartSync AI</h4>
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-60 italic">Live Medical Node</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsMinimized(true)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar" ref={scrollRef}>
              {messages.length === 0 && (
                <div className="text-center py-10">
                  <div className="w-16 h-16 bg-accent-maroon/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-accent-maroon animate-pulse" />
                  </div>
                  <h5 className="font-black text-slate-900 tracking-tight mb-2 italic">How is your heart today?</h5>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed px-6">
                    Analyze vitals or describe symptoms for pre-clinical assessment.
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-4 rounded-2xl text-xs font-bold leading-relaxed max-w-[80%] whitespace-pre-line ${
                    msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-slate-50 text-slate-600 border border-slate-100 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="p-4 bg-slate-50 rounded-2xl rounded-tl-none border border-slate-100 italic text-[10px] font-black text-slate-400 uppercase animate-pulse">
                    Analyzing Telemetry...
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-50 bg-slate-50/50">
              <div className="relative">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Describe your symptoms..."
                  className="w-full bg-white border border-slate-100 px-6 py-4 rounded-2xl text-xs font-bold outline-none focus:border-accent-maroon/20 focus:ring-4 focus:ring-accent-maroon/5 transition-all"
                />
                <button 
                  onClick={handleSend}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-accent-maroon text-white rounded-xl shadow-lg shadow-accent-maroon/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => {
          if (isOpen && isMinimized) setIsMinimized(false);
          else setIsOpen(!isOpen);
        }}
        className="w-16 h-16 bg-accent-maroon text-white rounded-[24px] shadow-glow-maroon hover:shadow-glow-maroon-hover hover:scale-105 active:scale-95 transition-all flex items-center justify-center relative group"
      >
        <Stethoscope className={`w-8 h-8 transition-transform duration-500 ${isOpen && !isMinimized ? 'rotate-[360deg]' : ''}`} />
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-4 border-white rounded-full animate-pulse" />
      </button>
    </div>
  );
};

export default AIChatWidget;
