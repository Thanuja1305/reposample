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
  const snap = await get(ref(rtdb, 'users'));
  if (snap.exists()) {
    console.log('=== users ===');
    const val = snap.val();
    for (const key of Object.keys(val)) {
      console.log(`User ID: ${key}`);
      const inner = val[key];
      for (const sub of Object.keys(inner)) {
        console.log(`  Subkey: ${sub}`);
        if (typeof inner[sub] === 'object') {
          console.log(`    Keys of ${sub}:`, Object.keys(inner[sub]));
          if (sub === 'liveReading' || sub === 'profile') {
            console.log(`    Content of ${sub}:`, JSON.stringify(inner[sub]));
          }
        } else {
          console.log(`    Val: ${inner[sub]}`);
        }
      }
    }
  }
}

inspect().catch(console.error);
