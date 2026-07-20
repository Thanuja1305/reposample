const { GoogleGenAI } = require('@google/genai');
const db = require('../services/db');
const firebaseService = require('../services/firebaseService');

let ai;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
} catch (e) {
  console.warn("[AI Controller] Gemini initialization failed:", e.message);
}

// In-memory cache for deduplication to prevent spamming AI
const patientCache = {};

const isValidNumber = (val) => typeof val === 'number' && !isNaN(val);

const validateVitals = (vitals) => {
    // Basic bounds check to ensure data is somewhat realistic / valid
    // If disconnected, typically they come in as 0, negative, or undefined
    if (!vitals) return false;
    
    const { heartRate, spo2, temperature, humidity } = vitals;
    
    if (!isValidNumber(heartRate) || heartRate <= 0 || heartRate > 300) return false;
    if (!isValidNumber(spo2) || spo2 <= 0 || spo2 > 100) return false;
    if (!isValidNumber(temperature) || temperature <= 0 || temperature > 50) return false;
    if (!isValidNumber(humidity) || humidity < 0 || humidity > 100) return false;
    
    return true;
};

const hasMeaningfulChange = (oldVitals, newVitals) => {
    if (!oldVitals) return true;
    
    // Check if difference is significant enough to warrant a new API call
    if (Math.abs(oldVitals.heartRate - newVitals.heartRate) >= 3) return true;
    if (Math.abs(oldVitals.spo2 - newVitals.spo2) >= 1) return true;
    if (Math.abs(oldVitals.temperature - newVitals.temperature) >= 0.3) return true;
    if (oldVitals.ecgStatus !== newVitals.ecgStatus) return true;
    
    return false;
};

const generateDiagnosis = async (req, res) => {
    const payload = req.body;
    
    // Extract exact keys as requested
    const { 
      patientId, 
      patientName, 
      age, 
      gender, 
      heartRate, 
      spo2, 
      temperature, 
      humidity, 
      signalQuality, 
      ecgStatus 
    } = payload;

    // 1. Validation
    if (!validateVitals({ heartRate, spo2, temperature, humidity })) {
        return res.status(400).json({ error: "Sensor Not Connected" });
    }

    // 2. Deduplication
    const currentVitals = { heartRate, spo2, temperature, humidity, ecgStatus };
    if (patientId && patientCache[patientId]) {
        const { vitals: oldVitals, report: oldReport, timestamp } = patientCache[patientId];
        // If less than 60 seconds have passed AND no meaningful change, return cached report
        if (Date.now() - timestamp < 60000 && !hasMeaningfulChange(oldVitals, currentVitals)) {
            return res.json(oldReport);
        }
    }

    // 3. Prompt Construction
    const prompt = `You are an AI Clinical Assistant helping doctors review real-time patient telemetry.

Analyze ONLY the provided physiological data.

Patient Information
Name: ${patientName || 'Unknown'}
Age: ${age || '--'}
Gender: ${gender || 'Unknown'}

Vitals
Heart Rate: ${heartRate}
SpO₂: ${spo2}
Temperature: ${temperature}
Humidity: ${humidity}
ECG Status: ${ecgStatus || 'Normal Signal'}
Signal Quality: ${signalQuality || 'Excellent'}

Tasks
Explain whether the values are normal or abnormal.
Mention which readings require attention.
Summarize the ECG status.
Estimate a risk level: Low, Moderate, High, Critical
Recommend the next clinical action.

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

    const executeOpenAIFallback = async () => {
        if (!process.env.OPENAI_API_KEY) throw new Error("No OpenAI API Key");
        
        const openAiResp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: "You are an AI Clinical Assistant. Output only valid JSON." },
                    { role: "user", content: prompt }
                ]
            })
        });

        const data = await openAiResp.json();
        if (data.error) throw new Error(data.error.message);
        return JSON.parse(data.choices[0].message.content);
    };

    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || process.env.GEMINI_KEY;
    
    if (geminiKey) {
        console.log(`[Gemini AI] Gemini API key loaded successfully (Key length: ${geminiKey.length})`);
    } else {
        console.warn(`[Gemini AI] Warning: No GEMINI_API_KEY found in environment variables.`);
    }

    console.log(`[Gemini AI] API request started for patient ${patientId || 'HS-001'}`);
    console.log(`[Gemini AI] Telemetry payload sent: HR=${heartRate} BPM, SpO2=${spo2}%, Temp=${temperature}°C, Hum=${humidity}%`);

    const executeDirectGeminiFetch = async (key) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || 'Gemini REST API error');
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    };

    let jsonResp = null;
    let attempt = 0;
    let success = false;

    // 1. Try Gemini via SDK or Direct REST fetch (with 1 retry)
    while (attempt < 2 && !success && geminiKey) {
        try {
            if (ai) {
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                });
                let text = response.text || '';
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                jsonResp = JSON.parse(text);
                success = true;
                console.log(`[Gemini AI] API response received via SDK.`);
            } else {
                jsonResp = await executeDirectGeminiFetch(geminiKey);
                success = true;
                console.log(`[Gemini AI] API response received via direct REST endpoint.`);
            }
        } catch (geminiError) {
            attempt++;
            console.warn(`[Gemini AI] Gemini attempt ${attempt} failed:`, geminiError.message);
        }
    }

    // 2. Fallback to OpenAI
    if (!success && process.env.OPENAI_API_KEY) {
        console.log("[Gemini AI] Switching to OpenAI fallback...");
        try {
            jsonResp = await executeOpenAIFallback();
            success = true;
            console.log(`[Gemini AI] API response received via OpenAI fallback.`);
        } catch (openAiError) {
            console.error("[Gemini AI] OpenAI fallback failed:", openAiError.message);
        }
    }

    // 3. Graceful Fallback if API keys are missing or provider calls fail (Step 6 Requirement)
    if (!success || !jsonResp) {
        console.log('[Gemini AI] Provider calls unavailable or failed. Using graceful fallback message.');
        let rLevel = 'Low';
        const abnormal = [];
        if (heartRate > 140 || heartRate < 50) { rLevel = 'Critical'; abnormal.push('Heart Rate'); }
        else if (heartRate > 100) { rLevel = 'High'; abnormal.push('Elevated Heart Rate'); }
        if (spo2 < 90) { rLevel = 'Critical'; abnormal.push('SpO2'); }
        if (temperature > 40 || temperature < 35) { rLevel = 'High'; abnormal.push('Temperature'); }

        const fallbackSummary = "AI medical analysis is temporarily unavailable. Critical abnormal vital signs detected. Immediate medical evaluation is recommended.";

        jsonResp = {
            summary: fallbackSummary,
            result: fallbackSummary,
            diagnosis: fallbackSummary,
            riskLevel: rLevel,
            abnormalParameters: abnormal.length > 0 ? abnormal : ['Vitals Anomaly'],
            recommendation: "Immediate medical evaluation is recommended.",
            confidence: "Rule Engine",
            priority: rLevel === 'Critical' ? 'HIGH' : 'MEDIUM'
        };
    }

    // Cache the report
    if (patientId) {
        patientCache[patientId] = {
            vitals: currentVitals,
            report: jsonResp,
            timestamp: Date.now()
        };
    }

    // Store generated AI report in PostgreSQL and write summary to RTDB
    try {
        await db.query(
            `INSERT INTO ai_reports (patient_id, summary, risk_level, abnormal_parameters, recommendation, confidence, vitals_snapshot)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                patientId || 'HS-001',
                jsonResp.summary,
                jsonResp.riskLevel,
                Array.isArray(jsonResp.abnormalParameters) ? jsonResp.abnormalParameters.join(',') : String(jsonResp.abnormalParameters || ''),
                jsonResp.recommendation,
                jsonResp.confidence || 'N/A',
                JSON.stringify(currentVitals)
            ]
        );
        console.log(`[Gemini AI] Success: AI report logged in PostgreSQL.`);
    } catch (pgError) {
        console.error(`[Gemini AI] PostgreSQL logging failed:`, pgError.message);
    }

    try {
        await firebaseService.storeRtdbAiDiagnosis(patientId || 'HS-001', {
            result: jsonResp.summary,
            summary: jsonResp.summary,
            diagnosis: jsonResp.summary,
            riskLevel: jsonResp.riskLevel,
            confidence: jsonResp.confidence || 'N/A',
            abnormalParameters: Array.isArray(jsonResp.abnormalParameters) ? jsonResp.abnormalParameters : (jsonResp.abnormalParameters ? String(jsonResp.abnormalParameters).split(',') : []),
            recommendation: jsonResp.recommendation,
            timestamp: Date.now()
        });
        console.log(`[Gemini AI] Summary saved to Firebase RTDB for patient ${patientId || 'HS-001'}`);
        console.log(`[Gemini AI] Summary displayed on Patient & Doctor Dashboards.`);
    } catch (rtdbError) {
        console.error(`[Gemini AI] Firebase RTDB AI diagnosis sync failed:`, rtdbError.message);
    }

    return res.json(jsonResp);

    } catch (err) {
        console.error("[AI Controller] Critical Error:", err.message);
        res.status(503).json({ error: "AI Report Currently Unavailable" });
    }
};

async function getAiReportsHistory(req, res) {
    try {
        const { patientId } = req.query;
        const result = await db.query(
            `SELECT * FROM ai_reports WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 50`,
            [patientId || 'HS-001']
        );
        // Map to frontend expectation
        const mapped = result.rows.map(row => ({
            id: row.id,
            patientId: row.patient_id,
            summary: row.summary,
            riskLevel: row.risk_level,
            abnormalParameters: row.abnormal_parameters ? row.abnormal_parameters.split(',') : [],
            recommendation: row.recommendation,
            confidence: row.confidence,
            vitalsAtTime: typeof row.vitals_snapshot === 'string' ? JSON.parse(row.vitals_snapshot) : row.vitals_snapshot,
            updatedAt: row.created_at
        }));
        res.status(200).json(mapped);
    } catch (error) {
        console.error('[AI Controller] Failed to fetch AI reports history:', error.message);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { 
    generateDiagnosis,
    getAiReportsHistory
};
