const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get } = require('firebase/database');
const dotenv = require('dotenv');

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const rtdb = getDatabase(app);

function scan(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;
  
  const keys = Object.keys(obj);
  if (keys.includes('bpm') || keys.includes('heartRate') || keys.includes('spo2') || keys.includes('temperature_c') || keys.includes('tempC')) {
    console.log(`Found vitals at: ${path}`);
    console.log(JSON.stringify(obj, null, 2));
  }
  
  for (const key of keys) {
    scan(obj[key], path ? `${path}/${key}` : key);
  }
}

async function search() {
  const snap = await get(ref(rtdb, '/'));
  if (snap.exists()) {
    scan(snap.val());
  } else {
    console.log('No data in RTDB');
  }
}

search().catch(console.error);
