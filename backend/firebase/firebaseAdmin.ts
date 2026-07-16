import { initializeApp, cert, getApps } from 'firebase-admin';
import { getDatabase, Database } from 'firebase-admin/database';
import dotenv from 'dotenv';

dotenv.config();

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const databaseURL = process.env.FIREBASE_DATABASE_URL;

let rtdbAdmin: Database | null = null;

if (!projectId || !clientEmail || !privateKey || !databaseURL) {
  console.warn('[Firebase Admin] Missing Firebase Admin credentials in environment variables.');
  console.warn('[Firebase Admin] Live telemetry updates to RTDB might fail. Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_DATABASE_URL.');
} else {
  try {
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: formattedPrivateKey,
        }),
        databaseURL,
      });
      console.log('[Firebase Admin] Initialized successfully.');
    }
    rtdbAdmin = getDatabase();
    console.log('[Firebase Admin] Connected to RTDB successfully.');
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization failed:', error.message);
  }
}

export { rtdbAdmin };
export default rtdbAdmin;
