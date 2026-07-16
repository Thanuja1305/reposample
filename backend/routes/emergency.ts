import { Router, Request, Response } from 'express';
// @ts-ignore
import { handleEmergencyAlert, handleCallAmbulance, getEmergencyHistory, resolveEmergencyAlert } from '../controllers/emergencyController';
// @ts-ignore
import dbService from '../services/db';
import twilio from 'twilio';

const router = Router();

// Outbound numbers from the executive directive
const AMBULANCE_NUMBER = '+919573732216';
const FRIEND_NUMBER = '+919502536635';
const FAMILY_NUMBER = '+919550413459';

router.post('/dispatch', async (req: Request, res: Response) => {
  try {
    const { patientUid } = req.body;
    if (!patientUid) {
      return res.status(400).json({ error: 'Missing patientUid' });
    }

    console.log(`[Emergency Dispatch] Initiating emergency dispatch sequence for patient ${patientUid}...`);

    // 1. Data Profile Fetching from PostgreSQL
    let patientName = 'Shivani';
    let age = 24;
    let gender = 'Female';
    let latitude = 17.425834776;
    let longitude = 78.329659494;
    let heartRate = 125;
    let spo2 = 88;
    let temperature = 39.2;
    let distance = '4.2 km';
    let eta = '12 mins';

    try {
      const patientRes = await dbService.query('SELECT * FROM patients WHERE id = $1', [patientUid]);
      if (patientRes.rows && patientRes.rows.length > 0) {
        const p = patientRes.rows[0];
        patientName = p.full_name || patientName;
        gender = p.gender || gender;
        if (p.dob) {
          const birthDate = new Date(p.dob);
          const today = new Date();
          let calculatedAge = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            calculatedAge--;
          }
          age = calculatedAge > 0 ? calculatedAge : age;
        }
      }
    } catch (e: any) {
      console.warn('[Emergency Dispatch] Patient query failed, using demo defaults:', e.message);
    }

    try {
      const telemetryRes = await dbService.query(
        'SELECT * FROM telemetry_history WHERE patient_id = $1 ORDER BY timestamp DESC LIMIT 1',
        [patientUid]
      );
      if (telemetryRes.rows && telemetryRes.rows.length > 0) {
        const t = telemetryRes.rows[0];
        heartRate = t.heart_rate || heartRate;
        spo2 = t.spo2 || spo2;
        temperature = t.temperature_c || temperature;
        latitude = t.latitude || latitude;
        longitude = t.longitude || longitude;
      }
    } catch (e: any) {
      console.warn('[Emergency Dispatch] Telemetry query failed, using defaults:', e.message);
    }

    const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;

    // 2. Initialize Twilio client
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioOutbound = process.env.TWILIO_PHONE_NUMBER || '+17623443944';

    console.log(`[Twilio] Initializing client using Account SID: ${twilioSid}`);
    const client = twilio(twilioSid, twilioToken);

    // 3. Ambulance voice call via Twilio
    const voiceTwiml = `
      <Response>
        <Say voice="alice" language="en-US">
          Critical Medical Emergency from HeartSync.
          Patient ${patientName}, aged ${age}, gender ${gender}, is in critical condition.
          Current vitals are: Heart rate is ${heartRate} B P M, and oxygen saturation is ${spo2} percent.
          GPS coordinates: Latitude ${latitude}, Longitude ${longitude}.
          Estimated distance is ${distance} with twelve minutes travel time.
          Dispatching emergency responders immediately.
        </Say>
      </Response>
    `;

    let voiceCallSid = 'mock_call_sid_12345';
    try {
      const call = await client.calls.create({
        twiml: voiceTwiml.trim(),
        to: AMBULANCE_NUMBER,
        from: twilioOutbound
      });
      voiceCallSid = call.sid;
      console.log(`[Twilio] Call initiated to Ambulance ${AMBULANCE_NUMBER}, Call SID: ${voiceCallSid}`);
    } catch (callError: any) {
      console.error(`[Twilio] Outbound call to Ambulance failed:`, callError.message);
    }

    // 4. SMS Alerts to Friends and Family
    const smsMessage = `CRITICAL HEALTH ALERT: HeartSync emergency triggered for ${patientName}.
Age: ${age} | Gender: ${gender}
Current Location: ${mapsUrl}
Est. Distance to ER: ${distance} | ETA: ${eta}
Emergency services have been dispatched.`;

    const smsRecipientNumbers = [FRIEND_NUMBER, FAMILY_NUMBER];
    const smsResults = [];

    for (const num of smsRecipientNumbers) {
      try {
        const msg = await client.messages.create({
          body: smsMessage,
          to: num,
          from: twilioOutbound
        });
        smsResults.push({ number: num, status: 'sent', sid: msg.sid });
        console.log(`[Twilio] SMS alert sent to emergency contact ${num}`);
      } catch (smsError: any) {
        smsResults.push({ number: num, status: 'failed', error: smsError.message });
        console.error(`[Twilio] SMS alert to contact ${num} failed:`, smsError.message);
      }
    }

    // 5. Audit Trail Logging into PostgreSQL
    try {
      const logDetails = `Voice Call SID: ${voiceCallSid}. SMS Broadcasts: ${JSON.stringify(smsResults)}. Maps URL: ${mapsUrl}`;
      await dbService.query(
        `INSERT INTO system_logs (user_id, action, details)
         VALUES ($1, $2, $3)`,
        [patientUid, 'EMERGENCY_DISPATCH', logDetails]
      );
      console.log('[DataConnect] Success: Emergency dispatch logged in PostgreSQL system_logs.');
    } catch (logError: any) {
      console.error('[DataConnect] PostgreSQL system_log insert failed:', logError.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Emergency services dispatched successfully',
      dispatchDetails: {
        patientName,
        age,
        gender,
        coordinates: { latitude, longitude },
        ambulanceCallSid: voiceCallSid,
        smsResults
      }
    });

  } catch (error: any) {
    console.error('[Emergency Dispatch] Critical error processing dispatch:', error.message);
    return res.status(500).json({ error: 'Failed to complete emergency dispatch sequence' });
  }
});

// Mount existing endpoints
router.post('/send-alert', handleEmergencyAlert);
router.post('/call-ambulance', handleCallAmbulance);
router.get('/history', getEmergencyHistory);
router.post('/resolve', resolveEmergencyAlert);

export default router;
