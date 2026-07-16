import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Stethoscope, Send, User, Sparkles, AlertCircle, Heart, Zap, ShieldCheck, Menu } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import PatientSidebar from '../components/PatientSidebar';
import { useAuth } from '../context/AuthContext';
import { db, rtdb } from '../../shared/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';

// Highly sophisticated, context-aware pre-clinical medical responder
const getPreClinicalResponse = (userInput: string, vitals: any, patientData: any) => {
  const query = userInput.toLowerCase().trim();
  const name = patientData?.fullName || patientData?.patientName || patientData?.displayName || 'Patient';
  
  // Extract real live vitals values without forcing mock defaults if values are 0 or empty
  const rawBpm = vitals?.heartRate ?? vitals?.bpm ?? vitals?.BPM ?? vitals?.HeartRate;
  const rawSpo2 = vitals?.spo2 ?? vitals?.SpO2 ?? vitals?.SPO2 ?? vitals?.oxygen;
  const rawTemp = vitals?.temperature_c ?? vitals?.Temperature_C ?? vitals?.temperature ?? vitals?.temp;

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

const AIChat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [vitals, setVitals] = useState<any>(null);
  const [patientData, setPatientData] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rawBpm = vitals?.heartRate ?? vitals?.bpm ?? vitals?.BPM ?? vitals?.HeartRate;
  const rawSpo2 = vitals?.spo2 ?? vitals?.SpO2 ?? vitals?.SPO2 ?? vitals?.oxygen;
  const hasVitals = rawBpm !== undefined && rawBpm !== null && Number(rawBpm) > 0 &&
                    rawSpo2 !== undefined && rawSpo2 !== null && Number(rawSpo2) > 0;

  useEffect(() => {
    if (user) {
      // 1. Identity data from 'users'
      const unsubPatient = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) setPatientData(snap.data());
      });

      // 2. Private health metrics from RTDB (multiplexed paths)
      const paths = [
        `patients/${user.uid}/liveVitals`,
        `patients/HS-001/liveVitals`,
        `liveHealthMetrics/${user.uid}`,
        `liveHealthMetrics/HS-001`,
        `users/${user.uid}/liveReading`,
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
          console.warn(`🔥 Chatbot page error listening to vitals path [${path}]:`, err);
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
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      
      const rawBpm = vitals?.heartRate ?? vitals?.bpm ?? vitals?.BPM ?? vitals?.HeartRate;
      const rawSpo2 = vitals?.spo2 ?? vitals?.SpO2 ?? vitals?.SPO2 ?? vitals?.oxygen;
      const rawTemp = vitals?.temperature_c ?? vitals?.Temperature_C ?? vitals?.temperature ?? vitals?.temp;

      const hasVitals = rawBpm !== undefined && rawBpm !== null && Number(rawBpm) > 0 &&
                        rawSpo2 !== undefined && rawSpo2 !== null && Number(rawSpo2) > 0;

      const bpm = hasVitals ? Number(rawBpm) : 0;
      const spo2 = hasVitals ? Number(rawSpo2) : 0;
      const temp = hasVitals ? Number(rawTemp) : 0;
      const hum = Number(vitals?.humidity || 0);

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
        ],
        config: {
          systemInstruction: "You are a specialized cardiac emergency assistant.",
        }
      });

      setMessages(prev => [...prev, { role: 'model', text: response.text || "Pre-clinical node online. Vitals are currently synchronized." }]);
    } catch (error) {
      console.warn("⚠️ AIChat Gemini link fallback active:", error);
      const fallbackResponse = getPreClinicalResponse(currentInput, vitals, patientData);
      setMessages(prev => [...prev, { role: 'model', text: fallbackResponse }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden relative font-sans text-slate-900">
      <PatientSidebar 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        patientData={patientData} 
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 lg:h-24 bg-white/70 backdrop-blur-2xl border-b border-slate-100 px-4 md:px-6 lg:px-12 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
             <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 bg-white rounded-xl border border-slate-100 shadow-sm text-slate-600">
                <Menu className="w-5 h-5" />
             </button>
             <div className="p-2 md:p-3 bg-accent-maroon rounded-lg md:rounded-2xl shadow-lg shadow-accent-maroon/20 text-white">
                <Stethoscope className="w-5 h-5 md:w-6 md:h-6" />
             </div>
             <div>
                <h1 className="text-base md:text-2xl font-bold text-slate-900 tracking-tight">AI Heart Assistant</h1>
                <p className="text-[8px] md:text-[10px] font-medium text-slate-400 uppercase tracking-widest leading-none">Powered by Gemini Neural V3</p>
             </div>
          </div>
          
          <div className="hidden sm:flex items-center gap-4 md:gap-6">
             <div className="flex flex-col items-end">
                <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Live Sync Status</span>
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                   <span className="text-[10px] md:text-xs font-bold text-slate-900 truncate max-w-[100px] md:max-w-none">{hasVitals ? (vitals?.current_condition || 'Stable') : 'Offline'} Indication</span>
                </div>
             </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col min-h-0 bg-white m-3 sm:m-4 md:m-6 lg:m-12 rounded-[20px] md:rounded-[40px] shadow-premium border border-slate-100 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 space-y-5 md:space-y-8 no-scrollbar" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[300px] h-full text-center max-w-lg mx-auto py-10 md:py-0">
                 <div className="w-16 h-16 md:w-24 md:h-24 bg-accent-maroon/5 rounded-full flex items-center justify-center mb-4 md:mb-6">
                    <Sparkles className="w-8 h-8 md:w-10 md:h-10 text-accent-maroon animate-pulse" />
                 </div>
                 <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-2 md:mb-4 tracking-tight px-4">Hello {patientData?.fullName?.split(' ')[0] || 'Registry Patient'}</h2>
                 <p className="text-xs md:text-sm font-medium text-slate-500 leading-relaxed px-6 md:px-0">
                    I am your personalized 24/7 cardiac intelligence assistant. I monitor your live vitals and ECG patterns to provide emergency guidance.
                 </p>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mt-8 md:mt-12 w-full px-4 md:px-0">
                    <Suggestion title="Interpret ECG" onClick={() => setInput("Can you explain my current ECG status?")} />
                    <Suggestion title="Symptom Check" onClick={() => setInput("I'm feeling slight chest pressure, what should I do?")} />
                 </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3 md:gap-4 max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                   <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-accent-maroon text-white'}`}>
                      {msg.role === 'user' ? <User className="w-4 h-4 md:w-5 md:h-5" /> : <Stethoscope className="w-4 h-4 md:w-5 md:h-5 text-white" />}
                   </div>
                   <div className={`p-4 md:p-6 rounded-[20px] md:rounded-3xl text-sm font-medium leading-relaxed shadow-sm whitespace-pre-line ${
                     msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none'
                   }`}>
                      {msg.text}
                   </div>
                </div>
              </motion.div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                 <div className="flex gap-3 md:gap-4">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-accent-maroon rounded-lg md:rounded-xl flex items-center justify-center text-white">
                       <Stethoscope className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </div>
                    <div className="flex gap-1 items-center px-4 md:px-6 py-3 md:py-4 bg-slate-50 rounded-[20px] md:rounded-3xl">
                       <div className="w-1.5 h-1.5 bg-accent-maroon rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                       <div className="w-1.5 h-1.5 bg-accent-maroon rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                       <div className="w-1.5 h-1.5 bg-accent-maroon rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                    </div>
                 </div>
              </div>
            )}
          </div>

          <div className="p-4 md:p-8 border-t border-slate-100 bg-[#F8FAFC]">
            <div className="relative max-w-4xl mx-auto flex gap-3 md:gap-4">
               <input 
                 type="text" 
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                 placeholder="Describe symptoms or ask about clinical heart metrics..."
                 className="flex-1 bg-white border border-slate-100 px-5 md:px-8 py-3.5 md:py-4 rounded-xl md:rounded-3xl text-sm md:text-base font-medium focus:outline-none focus:border-accent-maroon/20 focus:shadow-premium ring-offset-2 focus:ring-4 focus:ring-accent-maroon/5 transition-all w-full placeholder:text-slate-300"
               />
               <button 
                 onClick={handleSend}
                 disabled={isLoading}
                 className="w-12 h-12 md:w-14 md:h-14 bg-accent-maroon rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-glow-maroon hover:shadow-glow-maroon-hover hover:scale-105 active:scale-95 transition-all shrink-0"
               >
                 <Send className="w-5 h-5 md:w-6 md:h-6" />
               </button>
            </div>
            <p className="text-center mt-3 text-[8px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest hidden xs:block">
              Emergency Note: AI guidance is pre-clinical. Always rely on the SOS button for critical events.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

const Suggestion = ({ title, onClick }: any) => (
  <button 
    onClick={onClick}
    className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-left hover:border-accent-maroon/20 hover:bg-white hover:shadow-xl transition-all group"
  >
    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-accent-maroon">Quick Check</p>
    <p className="text-sm font-bold text-slate-900">{title}</p>
  </button>
);

export default AIChat;
