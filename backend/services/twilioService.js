const twilio = require('twilio');
const dotenv = require('dotenv');

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+17623443944';

// Use default numbers if not provided
const ambulanceNumber = '+919573732216';
const guardianNumber = '+917569824148';
const familyNumber = '+917569824148'; // Reusing for demonstration

/**
 * Perform the full sequential emergency escalation.
 */
async function executeSequentialEmergencyWorkflow(alertPayload) {
  const { patientName, age, heartRate, spo2, temperature, humidity, condition, locationUrl, patientId, timestamp } = alertPayload;
  const results = [];

  const textMessage = `🚨 *HEARTSYNC EMERGENCY ALERT*
*Patient:* ${patientName} (${age})
*Status:* ${condition}
*HR:* ${heartRate} BPM | *SpO2:* ${spo2}%
*Temp:* ${temperature}°C | *Hum:* ${humidity}%
*Live Location:* ${locationUrl}
*Timestamp:* ${timestamp}
Immediate assistance required.`;

  const voiceTwiml = `
    <Response>
      <Say voice="alice" language="en-US">
        Critical Medical Emergency from HeartSync.
        Patient ${patientName} is in critical condition.
        Heart rate is ${heartRate} B P M.
        Please check WhatsApp and SMS for exact GPS location and full vitals.
      </Say>
    </Response>
  `;

  // 1. Call Ambulance
  try {
    const call1 = await client.calls.create({ twiml: voiceTwiml.trim(), to: ambulanceNumber, from: fromNumber });
    results.push({ action: 'Call Ambulance', success: true, sid: call1.sid });
    console.log('[Twilio] Called Ambulance');
  } catch (e) {
    results.push({ action: 'Call Ambulance', success: false, error: e.message });
    console.error('[Twilio] Failed to call ambulance', e);
  }

  // 2. Call Guardian
  try {
    const call2 = await client.calls.create({ twiml: voiceTwiml.trim(), to: guardianNumber, from: fromNumber });
    results.push({ action: 'Call Guardian', success: true, sid: call2.sid });
    console.log('[Twilio] Called Guardian');
  } catch (e) {
    results.push({ action: 'Call Guardian', success: false, error: e.message });
    console.error('[Twilio] Failed to call guardian', e);
  }

  // 3. Call Family
  try {
    const call3 = await client.calls.create({ twiml: voiceTwiml.trim(), to: familyNumber, from: fromNumber });
    results.push({ action: 'Call Family', success: true, sid: call3.sid });
    console.log('[Twilio] Called Family');
  } catch (e) {
    results.push({ action: 'Call Family', success: false, error: e.message });
    console.error('[Twilio] Failed to call family', e);
  }

  // 4. Send SMS Guardian
  try {
    const sms1 = await client.messages.create({ body: textMessage.replace(/\*/g, ''), to: guardianNumber, from: fromNumber });
    results.push({ action: 'SMS Guardian', success: true, sid: sms1.sid });
    console.log('[Twilio] SMS to Guardian');
  } catch (e) {
    results.push({ action: 'SMS Guardian', success: false, error: e.message });
    console.error('[Twilio] Failed to SMS guardian', e);
  }

  // 5. Send SMS Family
  try {
    const sms2 = await client.messages.create({ body: textMessage.replace(/\*/g, ''), to: familyNumber, from: fromNumber });
    results.push({ action: 'SMS Family', success: true, sid: sms2.sid });
    console.log('[Twilio] SMS to Family');
  } catch (e) {
    results.push({ action: 'SMS Family', success: false, error: e.message });
    console.error('[Twilio] Failed to SMS family', e);
  }

  // 6. Send WhatsApp Guardian
  try {
    const wa1 = await client.messages.create({ body: textMessage, to: `whatsapp:${guardianNumber}`, from: fromWhatsApp });
    results.push({ action: 'WhatsApp Guardian', success: true, sid: wa1.sid });
    console.log('[Twilio] WhatsApp to Guardian');
  } catch (e) {
    results.push({ action: 'WhatsApp Guardian', success: false, error: e.message });
    console.error('[Twilio] Failed to WhatsApp guardian', e);
  }

  // 7. Send WhatsApp Family
  try {
    const wa2 = await client.messages.create({ body: textMessage, to: `whatsapp:${familyNumber}`, from: fromWhatsApp });
    results.push({ action: 'WhatsApp Family', success: true, sid: wa2.sid });
    console.log('[Twilio] WhatsApp to Family');
  } catch (e) {
    results.push({ action: 'WhatsApp Family', success: false, error: e.message });
    console.error('[Twilio] Failed to WhatsApp family', e);
  }

  return results;
}

// Keep legacy for backward compatibility if needed, but they won't be used in the new flow
async function sendWhatsApp(payload) { return executeSequentialEmergencyWorkflow(payload); }
async function callAmbulance() { return { success: true, message: 'Replaced by sequential workflow' }; }

module.exports = {
  executeSequentialEmergencyWorkflow,
  sendWhatsApp,
  callAmbulance
};
