import { useEffect, useRef } from 'react';
import { db, rtdb } from '../../shared/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const useAIAnalyst = (userId: string | undefined, metrics: any) => {
  const lastAnalysisTime = useRef<number>(0);
  const isAnalyzing = useRef<boolean>(false);

  useEffect(() => {
    if (!userId || !metrics) return;

    const now = Date.now();
    // Analyze every 1 minute (60,000 ms)
    if (now - lastAnalysisTime.current < 60000 || isAnalyzing.current) return;

    const runAnalysis = async () => {
      isAnalyzing.current = true;
      try {
        console.info("🧠 AI Analyst: Starting periodic health review...");
        
        const prompt = `
          As a Cardiology AI Specialist, analyze these live patient metrics and provide a structured assessment.
          
          PATIENT METRICS:
          - Heart Rate: ${metrics.bpm || metrics.heartRate} BPM
          - SpO2: ${metrics.spo2}%
          - Temperature: ${metrics.temperature}°F
          - Motion: ${metrics.motion || metrics.motionStatus}
          - ECG Status: High-frequency waveform active
          
          RESPOND IN JSON FORMAT:
          {
            "status": "NORMAL" | "RISK" | "EMERGENCY",
            "suggestion": "Brief friendly suggestion for the patient dashboard",
            "reasoning": "Clinical reasoning for the AI Assistant tab (2-3 sentences)",
            "recommendation": "Next steps or medical advice",
            "riskScore": 0-100 (where 0 is healthy),
            "riskLevel": "Stable" | "Elevated" | "Critical"
          }
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING },
                suggestion: { type: Type.STRING },
                reasoning: { type: Type.STRING },
                recommendation: { type: Type.STRING },
                riskScore: { type: Type.NUMBER },
                riskLevel: { type: Type.STRING }
              },
              required: ["status", "suggestion", "reasoning", "recommendation", "riskScore", "riskLevel"]
            }
          }
        });

        const analysisResult = JSON.parse(response.text || '{}');
        
        // Fetch patient name from RTDB (profiles migrated from Firestore)
        let patientName = "Active Patient";
        try {
          const userSnap = await get(ref(rtdb, `users/${userId}`));
          if (userSnap.exists()) {
            const uData = userSnap.val();
            patientName = uData.profile?.name || uData.profile?.fullName || uData.fullName || uData.displayName || "Active Patient";
          }
        } catch (e) {
          console.warn("Failed to fetch user name inside AI analyst:", e);
        }

        await setDoc(doc(db, 'aiAnalysis', userId), {
          ...analysisResult,
          updatedAt: serverTimestamp(),
          vitalsAtTime: {
            bpm: metrics.bpm || metrics.heartRate,
            spo2: metrics.spo2,
            temp: metrics.temperature
          }
        }, { merge: true });

        // If emergency, ensure emergencyAlert is updated
        if (analysisResult.status === 'EMERGENCY') {
          await setDoc(doc(db, 'emergencyAlerts', userId), {
            patientId: userId,
            patientName,
            aiSummary: analysisResult.reasoning,
            status: 'PENDING',
            severity: 'CRITICAL',
            detectedAt: new Date().toISOString(),
            timestamp: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        lastAnalysisTime.current = Date.now();
        console.info("✅ AI Analyst: Periodic review completed and synced.");
      } catch (error) {
        console.error("❌ AI Analyst Error:", error);
      } finally {
        isAnalyzing.current = false;
      }
    };

    runAnalysis();
  }, [userId, metrics]);
};
