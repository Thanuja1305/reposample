const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get } = require('firebase/database');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
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
const db = getFirestore(app);
const rtdb = getDatabase(app);

async function checkData() {
  console.log('--- FIRESTORE USERS ---');
  try {
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach(doc => {
      console.log(`ID: ${doc.id}, Role: ${doc.data().role}, Name: ${doc.data().name || doc.data().fullName}, Status: ${doc.data().status}`);
    });
  } catch (err) {
    console.error(err);
  }

  console.log('\n--- RTDB USERS ---');
  try {
    const snap = await get(ref(rtdb, 'users'));
    if (snap.exists()) {
      console.log(Object.keys(snap.val()));
    } else {
      console.log('None');
    }
  } catch (err) {
    console.error(err);
  }

  console.log('\n--- RTDB PATIENTS ---');
  try {
    const snap = await get(ref(rtdb, 'patients'));
    if (snap.exists()) {
      const val = snap.val();
      Object.keys(val).forEach(k => {
        console.log(`Patient ID: ${k}, liveVitals:`, !!val[k].liveVitals, `profile:`, !!val[k].profile);
      });
    } else {
      console.log('None');
    }
  } catch (err) {
    console.error(err);
  }

  console.log('\n--- RTDB LIVE HEALTH METRICS ---');
  try {
    const snap = await get(ref(rtdb, 'liveHealthMetrics'));
    if (snap.exists()) {
      console.log(Object.keys(snap.val()));
    } else {
      console.log('None');
    }
  } catch (err) {
    console.error(err);
  }

  console.log('\n--- RTDB ALERTS ---');
  try {
    const snap = await get(ref(rtdb, 'alerts'));
    if (snap.exists()) {
      console.log(snap.val());
    } else {
      console.log('None');
    }
  } catch (err) {
    console.error(err);
  }
}

checkData();
