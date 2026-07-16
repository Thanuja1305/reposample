const twilioService = require('../services/twilioService');
const firebaseService = require('../services/firebaseService');
const { generateGoogleMapsUrl } = require('../utils/locationUtils');
const db = require('../services/db');

async function handleEmergencyAlert(req, res) {
  try {
    const {
      patientName,
      age,
      heartRate,
      spo2,
      temperature_c,
      humidity,
      condition,
      ecgStatus,
      diagnosis,
      latitude,
      longitude,
      patientId,
      timestamp,
      doctorTriggeredAlertStatus
    } = req.body;

    console.log(`[Emergency Controller] Received emergency request for: ${patientName}`);

    // Parse coordinates and vital readings, matching whole integers where appropriate
    const lat = latitude !== undefined ? Number(latitude) : 17.425834775919437;
    const lng = longitude !== undefined ? Number(longitude) : 78.32965949351346;
    const hr = heartRate !== undefined ? Math.round(Number(heartRate)) : 1;
    const sp = spo2 !== undefined ? Math.round(Number(spo2)) : 20;
    const temp = temperature_c !== undefined ? Math.round(Number(temperature_c)) : 45;
    const hum = humidity !== undefined ? Math.round(Number(humidity)) : 55;
    const cond = condition || 'CRITICAL';
    const patId = patientId || 'HS-001';
    const patientAge = age !== undefined ? age : 24;
    const alertTs = timestamp || Date.now();

    const locationUrl = generateGoogleMapsUrl(lat, lng);

    const alertPayload = {
      patientName: patientName || 'Shivani',
      age: patientAge,
      heartRate: hr,
      spo2: sp,
      temperature: temp,
      humidity: hum,
      condition: cond,
      locationUrl: locationUrl,
      patientId: patId,
      timestamp: alertTs
    };

    let twilioResults = null;
    let logId = null;

    // 1. Execute sequential Twilio workflow (Voice -> SMS -> WhatsApp)
    try {
      twilioResults = await twilioService.executeSequentialEmergencyWorkflow(alertPayload);
    } catch (waError) {
      console.error(`[Emergency Controller] Twilio dispatch failed:`, waError.message);
      twilioResults = { success: false, error: waError.message };
    }

    // 2. Store log in Firebase (RTDB/Firestore)
    try {
      const alertId = `ALERT-${alertTs}`;
      
      // Write to Firestore log
      logId = await firebaseService.storeEmergencyLog({
        patientName: patientName || 'Shivani',
        age: patientAge,
        heartRate: hr,
        spo2: sp,
        temperature_c: temp,
        humidity: hum,
        condition: cond,
        ecgStatus: ecgStatus || 'CRITICAL',
        diagnosis: diagnosis || 'Critical Condition Detected',
        latitude: lat,
        longitude: lng,
        patientId: patId,
        timestamp: alertTs,
        doctorTriggeredAlertStatus: doctorTriggeredAlertStatus || 'SENT'
      });

      // Write to Firebase RTDB to trigger real-time UI/sirens
      await firebaseService.storeRtdbAlert(alertId, {
        patientId: patId,
        doctorId: 'DOC-001',
        status: 'critical',
        patientName: patientName || 'Shivani',
        age: patientAge || null,
        vitals: {
          heartRate: hr,
          spo2: sp,
          temperature: temp,
          humidity: hum
        },
        timestamp: alertTs,
        resolved: false
      });

    } catch (dbError) {
      console.error(`[Emergency Controller] Firebase logging failed:`, dbError.message);
      logId = null;
    }

    // 3. Write permanent structured alert record to PostgreSQL
    try {
      const alertId = `ALERT-${alertTs}`;
      await db.query(
        `INSERT INTO alerts (id, patient_id, doctor_id, severity, status, heart_rate_at_trigger, spo2_at_trigger, temp_at_trigger, ai_summary, detected_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
        [
          alertId,
          patId,
          'DOC-001', // Standard doctor profile mapping
          cond,
          'PENDING_DOCTOR_VERIFICATION',
          hr,
          sp,
          temp,
          diagnosis || 'Critical Condition Detected',
          new Date(alertTs)
        ]
      );
      console.log(`[Emergency Controller] Success: Emergency alert logged in PostgreSQL. ID: ${alertId}`);
    } catch (pgError) {
      console.error(`[Emergency Controller] PostgreSQL alert logging failed:`, pgError.message);
    }

    console.log(`[Emergency Controller] Emergency processing cycle complete.`);

    res.status(200).json({
      success: true,
      message: 'Emergency alert cycle complete',
      twilioResults: twilioResults,
      firebaseLogId: logId
    });

  } catch (error) {
    console.error('[Emergency Controller] Critical error processing emergency alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process emergency alert',
      error: error.message
    });
  }
}

async function handleCallAmbulance(req, res) {
  try {
    console.log(`[Emergency Controller] Initiating voice call to ambulance...`);
    const callResult = await twilioService.callAmbulance();
    
    if (callResult.success) {
      res.status(200).json({
        success: true,
        message: 'Ambulance voice call triggered successfully',
        callSid: callResult.sid
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to initiate ambulance call',
        error: callResult.error
      });
    }
  } catch (error) {
    console.error('[Emergency Controller] Error in handleCallAmbulance:', error);
    res.status(500).json({
      success: false,
      message: 'Critical error triggering ambulance call',
      error: error.message
    });
  }
}

async function getEmergencyHistory(req, res) {
  try {
    const { patientId } = req.query;
    const queryStr = `SELECT * FROM alerts WHERE patient_id = $1 ORDER BY detected_at DESC LIMIT 50`;
    const result = await db.query(queryStr, [patientId || 'HS-001']);
    
    // Map properties to match frontend models
    const mapped = result.rows.map(row => ({
      id: row.id,
      patientId: row.patient_id,
      severity: row.severity,
      status: row.status,
      vitalsAtTrigger: {
        heartRate: row.heart_rate_at_trigger,
        spo2: row.spo2_at_trigger,
        temperature: row.temp_at_trigger
      },
      aiSummary: row.ai_summary,
      detectedAt: row.detected_at.getTime ? row.detected_at.getTime() : new Date(row.detected_at).getTime()
    }));
    
    res.status(200).json(mapped);
  } catch (error) {
    console.error('[Emergency Controller] Failed to fetch alerts from PostgreSQL:', error.message);
    res.status(500).json({ error: error.message });
  }
}

async function resolveEmergencyAlert(req, res) {
  try {
    const { patientId, status } = req.body;
    const queryStr = `UPDATE alerts SET status = $1, resolved_at = $2 WHERE patient_id = $3 AND status != 'RESOLVED'`;
    await db.query(queryStr, [status || 'RESOLVED', new Date(), patientId || 'HS-001']);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Emergency Controller] Failed to resolve alert in PostgreSQL:', error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  handleEmergencyAlert,
  handleCallAmbulance,
  getEmergencyHistory,
  resolveEmergencyAlert
};

