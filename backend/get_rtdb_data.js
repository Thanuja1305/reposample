const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue } = require('firebase/database');
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

const vitalsRef = ref(rtdb, 'patients');
console.log('Fetching real-time data from database...');
onValue(vitalsRef, (snapshot) => {
  console.log(JSON.stringify(snapshot.val(), null, 2));
  process.exit(0);
});
