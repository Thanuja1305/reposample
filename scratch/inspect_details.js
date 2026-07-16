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

async function inspect() {
  console.log('=== patients/HS-001 ===');
  const snap1 = await get(ref(rtdb, 'patients/HS-001'));
  if (snap1.exists()) {
    console.log(JSON.stringify(snap1.val(), null, 2));
  } else {
    console.log('Not found');
  }

  console.log('=== liveHealthMetrics/HS-001 ===');
  const snap2 = await get(ref(rtdb, 'liveHealthMetrics/HS-001'));
  if (snap2.exists()) {
    console.log(JSON.stringify(snap2.val(), null, 2));
  } else {
    console.log('Not found');
  }
}

inspect().catch(console.error);
