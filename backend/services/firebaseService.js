const { initializeApp } = require('firebase/app');
const { getDatabase, ref: rtdbRef, set: rtdbSet } = require('firebase/database');
const { getFirestore, collection, doc, setDoc } = require('firebase/firestore');
const dotenv = require('dotenv');

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

/**
 * Store emergency log in Firestore
 */
async function storeEmergencyLog({
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
}) {
  try {
    const logData = {
      patientName: patientName || 'Shivani',
      age: age ? Number(age) : 24,
      heartRate: heartRate !== undefined ? Number(heartRate) : 1,
      spo2: spo2 !== undefined ? Number(spo2) : 20,
      temperature_c: temperature_c !== undefined ? Number(temperature_c) : 45,
      humidity: humidity !== undefined ? Number(humidity) : 55,
      condition: condition || 'CRITICAL',
      ecgStatus: ecgStatus || 'CRITICAL',
      diagnosis: diagnosis || 'Critical Condition Detected',
      location: {
        latitude: latitude !== undefined ? Number(latitude) : 17.425834775919437,
        longitude: longitude !== undefined ? Number(longitude) : 78.32965949351346
      },
      patientId: patientId || 'HS-001',
      timestamp: Number(timestamp) || Date.now(),
      doctorTriggeredAlertStatus: doctorTriggeredAlertStatus || 'SENT',
      createdAt: new Date().toISOString()
    };

    // Store in firestore collection 'emergencyLogs'
    const docRef = doc(collection(db, 'emergencyLogs'));
    await setDoc(docRef, logData);

    console.log(`[Firebase Log] Success: Emergency log stored in Firestore. ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error(`[Firebase Log] Error storing emergency log:`, error);
    throw error;
  }
}

/**
 * Store emergency alert in RTDB to trigger real-time UI/sirens
 */
async function storeRtdbAlert(alertId, alertData) {
  try {
    const alertRef = rtdbRef(rtdb, `alerts/${alertId}`);
    await rtdbSet(alertRef, alertData);
    console.log(`[Firebase RTDB Log] Success: RTDB alert stored. ID: ${alertRef.key}`);
  } catch (error) {
    console.error(`[Firebase RTDB Log] Error storing RTDB alert:`, error);
    throw error;
  }
}

/**
 * Store AI diagnosis summary in RTDB for real-time widget updates
 */
async function storeRtdbAiDiagnosis(patientId, diagnosisData) {
  try {
    const diagRef = rtdbRef(rtdb, `patients/${patientId}/aiDiagnosis`);
    await rtdbSet(diagRef, diagnosisData);
    console.log(`[Firebase RTDB Log] Success: AI diagnosis stored in RTDB for ${patientId}`);
  } catch (error) {
    console.error(`[Firebase RTDB Log] Error storing AI diagnosis in RTDB:`, error);
    throw error;
  }
}

module.exports = {
  app,
  db,
  rtdb,
  storeEmergencyLog,
  storeRtdbAlert,
  storeRtdbAiDiagnosis
};
