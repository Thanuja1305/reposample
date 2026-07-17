const twilioService = require('../services/twilioService');
const firebaseService = require('../services/firebaseService');
const { generateGoogleMapsUrl } = require('../utils/locationUtils');
const db = require('../services/db');
const { rtdb } = require('../services/firebaseService');
const { ref, get, set, update } = require('firebase/database');
const { doc, setDoc } = require('firebase/firestore');
const firebaseApp = require('../firebase/firebaseAdmin');

async function handleEmergencyAlert(req, res) {
  try {
    const {
      patientName,
      age,
      gender,
      bloodGroup,
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
      deviceStatus
    } = req.body;

    const patId = patientId || 'HS-001';
    console.log(`[Emergency Controller] Processing manual alert for patient ID: ${patId}`);

    const lat = latitude !== undefined ? Number(latitude) : 17.425834775919437;
    const lng = longitude !== undefined ? Number(longitude) : 78.32965949351346;
    const hr = heartRate !== undefined ? Math.round(Number(heartRate)) : 72;
    const sp = spo2 !== undefined ? Math.round(Number(spo2)) : 98;
    const temp = temperature_c !== undefined ? Number(temperature_c) : 36.8;
    const hum = humidity !== undefined ? Math.round(Number(humidity)) : 50;
    const cond = condition || 'Critical';
    const patientAge = age !== undefined ? age : 24;
    const alertTs = timestamp || Date.now();

    const alertsRef = ref(rtdb, 'alerts');
    const snapshot = await get(alertsRef);
    
    let existingAlertKey = null;
    let existingAlertData = null;

    if (snapshot.exists()) {
      const alerts = snapshot.val();
      for (const [key, val] of Object.entries(alerts)) {
        if (val && val.patientId === patId && !val.resolved) {
          existingAlertKey = key;
          existingAlertData = val;
          break;
        }
      }
    }

    if (existingAlertKey) {
      console.log(`[Emergency Controller] Unresolved alert ${existingAlertKey} already exists for patient ${patId}. Updating instead of duplicating.`);
      
      const targetRef = ref(rtdb, `alerts/${existingAlertKey}`);
      await update(targetRef, {
        timestamp: alertTs,
        vitals: {
          heartRate: hr,
          spo2: sp,
          temperature: temp,
          humidity: hum
        },
        location: {
          lat,
          lng,
          latitude: lat,
          longitude: lng
        },
        deviceStatus: deviceStatus || 'ONLINE'
      });
    } else {
      const alertId = `ALERT-${alertTs}`;
      console.log(`[Emergency Controller] Creating new alert record ${alertId} for patient ${patId}`);
      
      const targetRef = ref(rtdb, `alerts/${alertId}`);
      await set(targetRef, {
        patientId: patId,
        doctorId: 'DOC-001',
        status: 'pending',
        severity: 'critical',
        timestamp: alertTs,
        patientName: patientName || 'Shivani',
        age: patientAge,
        gender: gender || 'Female',
        bloodGroup: bloodGroup || '--',
        vitals: {
          heartRate: hr,
          spo2: sp,
          temperature: temp,
          humidity: hum
        },
        location: {
          lat,
          lng,
          latitude: lat,
          longitude: lng
        },
        deviceStatus: deviceStatus || 'ONLINE',
        twilioStatus: 'pending',
        acknowledged: false,
        resolved: false
      });
    }

    // Update RTDB live Reading paths
    const liveReadingRef = ref(rtdb, `users/${patId}/liveReading`);
    await update(liveReadingRef, {
      emergency: true,
      condition: cond,
      deviceStatus: deviceStatus || 'ONLINE',
      timestamp: alertTs
    });

    const liveVitalsRef = ref(rtdb, `patients/${patId}/liveVitals`);
    await update(liveVitalsRef, {
      emergency: true,
      condition: cond,
      timestamp: alertTs
    });

    const legacyReadingRef = ref(rtdb, `Patients/${patId}/liveReading`);
    await update(legacyReadingRef, {
      emergency: true,
      condition: cond,
      timestamp: alertTs
    });

    // Sync to Firestore emergencyAlerts for active monitor popup queries
    try {
      const dbFirestore = firebaseService.db;
      await setDoc(doc(dbFirestore, 'emergencyAlerts', patId), {
        patientId: patId,
        status: 'pending',
        severity: 'critical',
        timestamp: alertTs,
        emergency: true,
        acknowledged: false,
        resolved: false
      }, { merge: true });
      console.log(`[Emergency Controller] Firestore emergencyAlerts synced for ${patId}`);
    } catch (fsErr) {
      console.warn(`[Emergency Controller] Firestore emergencyAlerts sync failed:`, fsErr.message);
    }

    // Store log entry in FireStore
    let logId = null;
    try {
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
        doctorTriggeredAlertStatus: 'PENDING'
      });
    } catch (dbError) {
      console.error(`[Emergency Controller] Firebase logging failed:`, dbError.message);
    }

    // Write permanent structured alert record to PostgreSQL
    try {
      const psqlAlertId = `ALERT-${alertTs}`;
      await db.query(
        `INSERT INTO alerts (id, patient_id, doctor_id, severity, status, heart_rate_at_trigger, spo2_at_trigger, temp_at_trigger, ai_summary, detected_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
        [
          psqlAlertId,
          patId,
          'DOC-001',
          cond,
          'PENDING_DOCTOR_VERIFICATION',
          hr,
          sp,
          temp,
          diagnosis || 'Critical Condition Detected',
          new Date(alertTs)
        ]
      );
      console.log(`[Emergency Controller] PostgreSQL alert logged: ${psqlAlertId}`);
    } catch (pgError) {
      console.error(`[Emergency Controller] PostgreSQL alert logging failed:`, pgError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Emergency alert logged and synced successfully',
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

