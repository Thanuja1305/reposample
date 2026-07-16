import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { 
  initializeFirestore, 
  getFirestore,
  doc, 
  getDocFromServer, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";
import { getAnalytics } from "firebase/analytics";

// FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAccH7rClosmQwrreeseAmHpk3RhJN3M2I",
  authDomain: "heartsync-3b608.firebaseapp.com",
  databaseURL: "https://heartsync-3b608-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "heartsync-3b608",
  storageBucket: "heartsync-3b608.firebasestorage.app",
  messagingSenderId: "3825789912",
  appId: "1:3825789912:web:377c919c80a662ef0e20ad",
  measurementId: "G-J7RB74GVJS"
};

// Singleton app initialization (HMR safe)
const isNewApp = getApps().length === 0;
const app = isNewApp ? initializeApp(firebaseConfig) : getApp();

// Removed forceLongPolling() as it uses legacy document.write() iframes which Chrome blocks, causing infinite loading spinners.

// Exports
export const auth = getAuth(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Analytics
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Firestore with persistent cache
export let db: any;
if (isNewApp) {
  try {
    if (import.meta.env.PROD) {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        }),
        experimentalAutoDetectLongPolling: true
      });
    } else {
      db = getFirestore(app);
    }
  } catch (e: any) {
    if (e.message && e.message.includes('already been called')) {
      db = getFirestore(app);
    } else {
      throw e;
    }
  }
} else {
  db = getFirestore(app);
}

// --- Necessary Exports to fix crashes in other components ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

export function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  console.error('Firestore Error:', error);
  throw error;
}

export function parseFirestoreError(error: any): string {
  return error.message || String(error);
}

console.log("🔥 HeartSync Firebase Restored");

export default app;