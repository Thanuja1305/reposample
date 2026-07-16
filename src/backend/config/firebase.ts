import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAccH7rClosmQwrreeseAmHpk3RhJN3M2I",
  authDomain: "heartsync-3b608.firebaseapp.com",
  databaseURL:
    "https://heartsync-3b608-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "heartsync-3b608",
  storageBucket: "heartsync-3b608.firebasestorage.app",
  messagingSenderId: "3825789912",
  appId: "1:3825789912:web:377c919c80a662ef0e20ad",
};

const isNewApp = getApps().length === 0;
const app = isNewApp ? initializeApp(firebaseConfig) : getApp();

// WebSockets enabled by default (forceLongPolling removed to fix connection stalls)

export const rtdb = getDatabase(app);

console.log("🔥 Firebase Connected");