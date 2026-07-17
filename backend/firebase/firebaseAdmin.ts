import { initializeApp, cert, getApps } from 'firebase-admin';
import { getDatabase, Database } from 'firebase-admin/database';
import dotenv from 'dotenv';

dotenv.config();

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const databaseURL = process.env.FIREBASE_DATABASE_URL;

/**
 * Bulletproof Firebase private key parser.
 *
 * Render (and many CI platforms) serialize the private key in one of three ways:
 *   1. Literal escaped:  -----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----
 *   2. JSON-quoted:     "-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----"
 *   3. Already correct: Real newlines already embedded by the shell.
 *
 * This function normalises all three cases to a valid PEM string.
 */
function parsePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  // Strip surrounding JSON double-quotes if present (e.g. pasted with quotes from JSON file)
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }

  // Replace every literal backslash-n sequence (\\n in source = \n as two chars in the string)
  // that was NOT already replaced by the shell with a real newline character.
  key = key.replace(/\\n/g, '\n');

  return key;
}

const privateKey = parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

let rtdbAdmin: Database | null = null;

if (!projectId || !clientEmail || !privateKey || !databaseURL) {
  console.warn('[Firebase Admin] Missing Firebase Admin credentials in environment variables.');
  console.warn('[Firebase Admin] Live telemetry updates to RTDB might fail. Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_DATABASE_URL.');
} else {
  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
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
