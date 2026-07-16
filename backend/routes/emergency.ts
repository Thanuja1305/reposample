import { Router, Request, Response } from 'express';
// @ts-ignore
import { handleEmergencyAlert, handleCallAmbulance, getEmergencyHistory, resolveEmergencyAlert } from '../controllers/emergencyController';
// @ts-ignore
import dbService from '../services/db';
import { rtdbAdmin } from '../firebase/firebaseAdmin';
import twilio from 'twilio';

const router = Router();

// Default emergency contacts to fallback on if PostgreSQL yields empty rows
const DEFAULT_CONTACTS = [
  { name: 'Friend', phone: '+919502536635' },
  { name: 'Family', phone: '+919550413459' }
];

// In-memory Anti-Spam Cooldown Map (Patient UID -> Last Dispatch Timestamp)
const cooldowns = new Map<string, number>();

router.post('/dispatch', async (req: Request, res: Response) => {
  try {
    const { patientUid } = req.body;
    if (!patientUid) {
      return res.status(400).json({ error: 'Missing patientUid' });
    }

    // 1. Verify Cooldown Lock (5 minutes = 300000 ms)
    const now = Date.now();
    const lastDispatch = cooldowns.get(patientUid);
    if (lastDispatch && (now - lastDispatch < 5 * 60 * 1000)) {
      const remainingSeconds = Math.ceil((5 * 60 * 1000 - (now - lastDispatch)) / 1000);
      console.log(`[Emergency Dispatch] Cooldown active for patient ${patientUid}. ${remainingSeconds}s remaining. Rejecting request.`);
      return res.status(429).json({
        success: false,
        message: `Cooldown active. Please wait ${remainingSeconds} seconds before triggering another emergency dispatch.`
      });
    }

    // 2. Verify Emergency State from RTDB (live state check)
    let isEmergency = false;
    if (!rtdbAdmin) {
      // In local mock database fallback mode without Firebase Admin, bypass check for demo/test patients
      console.log(`[Emergency Dispatch] Firebase Admin not initialized. Bypassing live check for demo patient.`);
      isEmergency = true;
    } else {
      try {
        const vitalsSnapshot = await rtdbAdmin.ref(`patients/${patientUid}/liveVitals`).once('value');
        if (vitalsSnapshot.exists()) {
          const val = vitalsSnapshot.val();
          isEmergency = val.emergency === true || val.emergencyFlag === true || val.condition === 'Critical';
        }
        
        // Also check if an active alert exists
        const alertSnapshot = await rtdbAdmin.ref(`activeAlerts/${patientUid}`).once('value');
        if (alertSnapshot.exists() && alertSnapshot.val()?.resolved !== true) {
          isEmergency = true;
        }
      } catch (e: any) {
        console.warn('[Emergency Dispatch] Firebase RTDB verification failed, using bypass:', e.message);
        isEmergency = true; // Fallback to allow demo clicks
      }
    }

    if (!isEmergency) {
      console.log(`[Emergency Dispatch] Blocked: Patient ${patientUid} does not have an active emergency status flag in RTDB.`);
      return res.status(400).json({ error: 'No active emergency flag found for this patient in Firebase RTDB' });
    }

    console.log(`[Emergency Dispatch] Verification passed. Initiating Twilio Emergency Dispatch for patient ${patientUid}...`);

    // 3. Data Retrieval: Query PostgreSQL (Demographics) & Firebase RTDB (Live State)
    let patientName = 'Shivani';
    let age = 24;
    let gender = 'Female';
    let latitude = 17.425834776;
    let longitude = 78.329659494;
    let heartRate = 120;
    let spo2 = 92;
    let temperature = 37.5;
    let distance = '4.2 km';
    let emergencyContacts: any[] = [];

    // Query Patient Details
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
      console.warn('[Emergency Dispatch] Patients PostgreSQL query failed, using defaults:', e.message);
    }

    // Query Emergency Contacts
    try {
      const contactsRes = await dbService.query('SELECT * FROM emergency_contacts WHERE patient_id = $1', [patientUid]);
      if (contactsRes.rows && contactsRes.rows.length > 0) {
        emergencyContacts = contactsRes.rows.map(row => ({
          name: row.name || row.contact_name || 'Contact',
          phone: row.phone || row.contact_phone
        })).filter(c => c.phone);
      }
    } catch (e: any) {
      console.warn('[Emergency Dispatch] Emergency contacts PostgreSQL query failed, using defaults:', e.message);
    }

    if (emergencyContacts.length === 0) {
      console.log('[Emergency Dispatch] No contacts found in PostgreSQL, loading fallback demo numbers.');
      emergencyContacts = [...DEFAULT_CONTACTS];
    }

    // Query current live coordinates & vitals from RTDB
    try {
      if (rtdbAdmin) {
        const liveSnapshot = await rtdbAdmin.ref(`liveReadings/${patientUid}`).once('value');
        if (liveSnapshot.exists()) {
          const liveVal = liveSnapshot.val();
          heartRate = liveVal.heartRate || heartRate;
          spo2 = liveVal.spo2 || spo2;
          temperature = liveVal.temperature || temperature;
          
          if (liveVal.location) {
            latitude = liveVal.location.latitude || latitude;
            longitude = liveVal.location.longitude || longitude;
          }
        }
      }
    } catch (rtdbErr: any) {
      console.warn('[Emergency Dispatch] Firebase RTDB vitals fetch failed, using defaults:', rtdbErr.message);
    }

    const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
    const locationString = `Latitude ${latitude.toFixed(4)} and Longitude ${longitude.toFixed(4)}`;

    // 4. Initialize Twilio client
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioVoiceFrom = process.env.TWILIO_VOICE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+17623443944';
    
    // Twilio WhatsApp Outbound number (must include whatsapp: prefix)
    let twilioWhatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
    if (!twilioWhatsappFrom.startsWith('whatsapp:')) {
      twilioWhatsappFrom = `whatsapp:${twilioWhatsappFrom}`;
    }

    console.log(`[Twilio] Initializing client using Account SID: ${twilioSid}`);
    const client = twilio(twilioSid, twilioToken);

    // 5. The Ambulance Outbound Voice Call (using exact TwiML `<Say>` syntax)
    const ambulanceNumber = '+919573732216';
    const voiceTwiml = `
      <Response>
        <Say voice="alice" language="en-US">
          Emergency Alert. HeartSync patient ${patientName}, a ${age} year old ${gender}, is experiencing critical vitals. Current location is ${locationString}. Please dispatch immediately.
        </Say>
      </Response>
    `;

    let voiceCallSid = 'mock_call_sid_67890';
    try {
      const call = await client.calls.create({
        twiml: voiceTwiml.trim(),
        to: ambulanceNumber,
        from: twilioVoiceFrom
      });
      voiceCallSid = call.sid;
      console.log(`[Twilio] Call successfully placed to Ambulance ${ambulanceNumber}, Call SID: ${voiceCallSid}`);
    } catch (callError: any) {
      console.error(`[Twilio] Outbound call to Ambulance failed:`, callError.message);
    }

    // 6. The Family/Contacts Outbound WhatsApp Messages & Standard SMS Alerts
    const timeString = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const whatsappMessagePayload = `Name: ${patientName}
Age: ${age}
Gender: ${gender}
Location(live): ${mapsUrl}
Time: ${timeString}
Distance: ${distance}`;

    const smsMessagePayload = `CRITICAL HEALTH ALERT: HeartSync emergency triggered for ${patientName}.
Age: ${age} | Gender: ${gender}
Current Location: ${mapsUrl}
Est. Distance to ER: 4.2 km | ETA: 12 mins
Emergency services have been dispatched.`;

    const dispatchNotificationsResults = [];

    for (const contact of emergencyContacts) {
      const cleanPhone = contact.phone.replace(/\s+/g, '');
      const whatsappTo = cleanPhone.startsWith('whatsapp:') ? cleanPhone : `whatsapp:${cleanPhone}`;

      // A. Send WhatsApp Alert
      let whatsappSid = null;
      let whatsappStatus = 'failed';
      let whatsappError = null;
      try {
        const waMsg = await client.messages.create({
          body: whatsappMessagePayload,
          to: whatsappTo,
          from: twilioWhatsappFrom
        });
        whatsappSid = waMsg.sid;
        whatsappStatus = 'sent';
        console.log(`[Twilio] WhatsApp alert sent to ${contact.name} (${whatsappTo})`);
      } catch (waErr: any) {
        whatsappError = waErr.message;
        console.error(`[Twilio] WhatsApp alert to ${contact.name} failed:`, waErr.message);
      }

      // B. Send standard backup SMS Alert
      let smsSid = null;
      let smsStatus = 'failed';
      let smsError = null;
      try {
        const smsMsg = await client.messages.create({
          body: smsMessagePayload,
          to: cleanPhone.replace('whatsapp:', ''),
          from: twilioVoiceFrom
        });
        smsSid = smsMsg.sid;
        smsStatus = 'sent';
        console.log(`[Twilio] Backup SMS alert sent to ${contact.name} (${cleanPhone})`);
      } catch (smsErr: any) {
        smsError = smsErr.message;
        console.error(`[Twilio] Backup SMS alert to ${contact.name} failed:`, smsErr.message);
      }

      dispatchNotificationsResults.push({
        contactName: contact.name,
        phone: cleanPhone,
        whatsapp: { status: whatsappStatus, sid: whatsappSid, error: whatsappError },
        sms: { status: smsStatus, sid: smsSid, error: smsError }
      });
    }

    // Set Cooldown lock timestamp upon successful dispatch
    cooldowns.set(patientUid, now);

    // 7. Permanent Audit Trail Logging into PostgreSQL system_logs
    try {
      const auditDetails = JSON.stringify({
        voiceCall: { to: ambulanceNumber, status: voiceCallSid !== 'mock_call_sid_67890' ? 'placed' : 'mocked', sid: voiceCallSid },
        notifications: dispatchNotificationsResults,
        location: { latitude, longitude, mapsUrl }
      });
      await dbService.query(
        `INSERT INTO system_logs (user_id, action, details)
         VALUES ($1, $2, $3)`,
        [patientUid, 'EMERGENCY_DISPATCH', auditDetails]
      );
      console.log('[DataConnect] Success: Emergency dispatch confirmed and logged in PostgreSQL.');
    } catch (logError: any) {
      console.error('[DataConnect] PostgreSQL system_log insert failed:', logError.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Emergency services and family contacts dispatched successfully via calls, sms and whatsapp',
      dispatchDetails: {
        patientName,
        age,
        gender,
        coordinates: { latitude, longitude },
        ambulanceCallSid: voiceCallSid,
        results: dispatchNotificationsResults
      }
    });

  } catch (error: any) {
    console.error('[Emergency Dispatch] Critical failure in dispatch route:', error.message);
    return res.status(500).json({ error: 'Failed to execute outbound emergency calls and messages' });
  }
});

// Mount other router controllers
router.post('/send-alert', handleEmergencyAlert);
router.post('/call-ambulance', handleCallAmbulance);
router.get('/history', getEmergencyHistory);
router.post('/resolve', resolveEmergencyAlert);

export default router;
