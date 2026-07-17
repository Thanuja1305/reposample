import { GoogleGenAI } from '@google/genai';
// @ts-ignore
import dbService from './db';
import { rtdbAdmin } from '../firebase/firebaseAdmin';

let aiInstance: any = null;
try {
  if (process.env.GEMINI_API_KEY) {
    aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
} catch (e: any) {
  console.warn('[AI Service] Gemini initialization failed:', e.message);
}

// In-memory cache for deduplication to prevent AI spamming
const aiCache: Record<string, { vitals: any; report: any; timestamp: number }> = {};

export interface VitalsPayload {
  patientId: string;
  patientName?: string;
  age?: number;
  gender?: string;
  heartRate: number;
  spo2: number;
  temperature: number;
  humidity: number;
  sensorStatus?: string;
  signalQuality?: string;
  ecgStatus?: string;
}

const hasSignificantChange = (oldV: any, newV: any): boolean => {
  if (!oldV) return true;
  if (Math.abs(oldV.heartRate - newV.heartRate) >= 5) return true;
  if (Math.abs(oldV.spo2 - newV.spo2) >= 2) return true;
  if (Math.abs(oldV.temperature - newV.temperature) >= 0.5) return true;
  if (oldV.ecgStatus !== newV.ecgStatus) return true;
  return false;
};

export async function generateReport(vitals: VitalsPayload): Promise<any> {
  const {
    patientId,
    patientName = 'Shivani',
    age = 24,
    gender = 'Female',
    heartRate,
    spo2,
    temperature,
    humidity,
    sensorStatus = 'nominal',
    signalQuality = 'Excellent',
    ecgStatus = 'Normal'
  } = vitals;

  // Basic validation check (skip if vitals are invalid or standby)
  if (heartRate <= 0 || heartRate > 220 || spo2 <= 0 || spo2 > 100 || temperature <= 0 || sensorStatus === 'NO_FINGER') {
    console.log(`[AI Service] Skipped generation for patient ${patientId} due to standby or invalid vitals.`);
    return null;
  }

  const currentVitals = { heartRate, spo2, temperature, humidity, ecgStatus };
  const cached = aiCache[patientId];
  if (cached) {
    const timeElapsed = Date.now() - cached.timestamp;
    // Debounce: 60s cooldown unless significant changes occur
    if (timeElapsed < 60000 && !hasSignificantChange(cached.vitals, currentVitals)) {
      console.log(`[AI Service] Using cached report for patient ${patientId}.`);
      return cached.report;
    }
  }

  console.log(`[AI Service] Starting report generation for patient ${patientId}...`);

  const prompt = `You are an AI Clinical Assistant helping doctors review real-time patient telemetry.

Analyze ONLY the provided physiological data.

Patient Information
Name: ${patientName}
Age: ${age}
Gender: ${gender}

Vitals
Heart Rate: ${heartRate} BPM
SpO₂: ${spo2}%
Temperature: ${temperature}°C
Humidity: ${humidity}%
ECG Status: ${ecgStatus}
Signal Quality: ${signalQuality}

Tasks
1. Explain whether the values are normal or abnormal.
2. Mention which readings require attention.
3. Summarize the ECG status.
4. Estimate a risk level: Low, Moderate, High, Critical
5. Recommend the next clinical action (Explanation & Recommendations).

Do NOT diagnose diseases.
Do NOT prescribe medication.
Do NOT claim certainty.

Output only JSON.
Format:
{
  "summary": "",
  "riskLevel": "",
  "abnormalParameters": [],
  "recommendation": "",
  "confidence": ""
}`;

  const executeOpenAi = async (): Promise<any> => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('No OpenAI API Key configured in environment.');
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are an AI Clinical Assistant. Output only valid JSON.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    return JSON.parse(result.choices[0].message.content);
  };

  let report: any = null;
  let success = false;

  // 1. Try Gemini
  if (process.env.GEMINI_API_KEY && aiInstance) {
    try {
      const response = await aiInstance.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      let text = response.text || '';
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      report = JSON.parse(text);
      success = true;
      console.log(`[AI Service] Successfully generated report using Gemini.`);
    } catch (geminiError: any) {
      console.warn(`[AI Service] Gemini generation failed:`, geminiError.message);
    }
  }

  // 2. Fallback to OpenAI
  if (!success) {
    console.log('[AI Service] Attempting OpenAI fallback...');
    try {
      report = await executeOpenAi();
      success = true;
      console.log(`[AI Service] Successfully generated report using OpenAI.`);
    } catch (openaiError: any) {
      console.error('[AI Service] OpenAI fallback failed:', openaiError.message);
    }
  }

  // 3. Fallback to local rule-based JSON if both providers are unconfigured or fail
  if (!success || !report) {
    console.log('[AI Service] Both AI providers failed or unconfigured. Creating mock report.');
    let risk = 'Low';
    const abnormal: string[] = [];
    if (heartRate > 120 || heartRate < 50) {
      risk = 'High';
      abnormal.push('Heart Rate');
    }
    if (spo2 < 92) {
      risk = 'Critical';
      abnormal.push('SpO2');
    }
    if (temperature > 38 || temperature < 35) {
      risk = 'Moderate';
      abnormal.push('Temperature');
    }
    report = {
      summary: `Clinical readings logged. Heart rate is ${heartRate} BPM, SpO2 is ${spo2}%, temperature is ${temperature}°C.`,
      riskLevel: risk,
      abnormalParameters: abnormal,
      recommendation: risk === 'Critical' ? 'Immediate clinical review and evaluation required.' : 'Continue routine monitoring.',
      confidence: '85%'
    };
  }

  // Cache report
  aiCache[patientId] = {
    vitals: currentVitals,
    report,
    timestamp: Date.now()
  };

  // 4. Save to PostgreSQL ai_reports
  try {
    await dbService.query(
      `INSERT INTO ai_reports (patient_id, summary, risk_level, abnormal_parameters, recommendation, confidence, vitals_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        patientId,
        report.summary,
        report.riskLevel,
        Array.isArray(report.abnormalParameters) ? report.abnormalParameters.join(',') : String(report.abnormalParameters || ''),
        report.recommendation,
        report.confidence || 'N/A',
        JSON.stringify(currentVitals)
      ]
    );
    console.log(`[AI Service] Saved AI report for patient ${patientId} to PostgreSQL.`);
  } catch (pgErr: any) {
    console.error(`[AI Service] Failed to save AI report to PostgreSQL:`, pgErr.message);
  }

  // 5. Sync to Firebase RTDB patients/{patientId}/aiDiagnosis and reports/{reportId}
  try {
    if (rtdbAdmin) {
      const payload = {
        result: report.summary,
        summary: report.summary,
        diagnosis: report.summary,
        riskLevel: report.riskLevel,
        confidence: report.confidence || 'N/A',
        abnormalParameters: Array.isArray(report.abnormalParameters) ? report.abnormalParameters : [],
        recommendation: report.recommendation,
        timestamp: Date.now()
      };
      
      await rtdbAdmin.ref(`patients/${patientId}/aiDiagnosis`).set(payload);
      
      const reportId = `REP-${Date.now()}`;
      await rtdbAdmin.ref(`reports/${reportId}`).set({
        ...payload,
        patientId,
        patientName
      });
      console.log(`[AI Service] Synced AI report for patient ${patientId} to Firebase RTDB.`);
    }
  } catch (rtdbErr: any) {
    console.error(`[AI Service] Failed to sync AI report to Firebase RTDB:`, rtdbErr.message);
  }

  return report;
}
