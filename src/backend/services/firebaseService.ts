import { rtdb } from '../../shared/lib/firebase';
import { ref, get, set, update } from "firebase/database";

export interface UserProfileData {
  name: string;
  age: string;
  gender: string;
  email: string;
  createdAt?: any;
}

export interface EmergencyContact {
  name: string;
  phone: string;
}

export interface EmergencyContacts {
  ambulance: EmergencyContact;
  family: EmergencyContact;
  friend: EmergencyContact;
}

export interface LiveReading {
  ecg: string | number;
  spo2: string | number;
  bpm: string | number;
  temperature: string | number;
  updatedAt?: any;
}

export interface ReadingsHistoryEntry {
  ecg: string | number;
  spo2: string | number;
  bpm: string | number;
  temperature: string | number;
  timestamp: string | any;
}

/**
 * Creates or overwrites a unified patient/user structure in RTDB under users/{uid}.
 */
export async function createUserProfile(
  uid: string,
  profileData: UserProfileData,
  emergencyContacts?: EmergencyContacts,
  liveReading?: LiveReading,
  readingsHistory: ReadingsHistoryEntry[] = []
): Promise<void> {
  const userRef = ref(rtdb, `users/${uid}`);

  // Build profile — only include fields that have real values
  const profileNode: any = {
    name: profileData.name || "",
    email: profileData.email || "",
    createdAt: profileData.createdAt || Date.now(),
  };
  if (profileData.age) profileNode.age = profileData.age;
  if (profileData.gender) profileNode.gender = profileData.gender;

  const payload = {
    uid,
    profile: profileNode,
    emergencyContacts: emergencyContacts || {
      ambulance: { name: "", phone: "" },
      family: { name: "", phone: "" },
      friend: { name: "", phone: "" },
    },
    liveReading: liveReading || {
      ecg: "",
      spo2: 0,
      bpm: 0,
      temperature: 0,
      updatedAt: Date.now(),
    },
    readingsHistory: readingsHistory || [],
    role: "patient",
    status: "approved",
    onboarded: false,
    onboardingCompleted: false,
    updatedAt: Date.now(),
  };

  await set(userRef, payload);
}

/**
 * Retrieves the unified user profile document from Realtime Database.
 */
export async function getCurrentUserProfile(uid: string): Promise<any> {
  const userRef = ref(rtdb, `users/${uid}`);
  const snap = await get(userRef);
  if (snap.exists()) {
    return snap.val();
  }
  return null;
}

/**
 * Replaces the liveReading object with the latest realtime sensor metrics in RTDB.
 */
export async function updateLiveReading(
  uid: string,
  reading: Partial<LiveReading>
): Promise<void> {
  const liveReadingRef = ref(rtdb, `users/${uid}/liveReading`);

  // Use set() to fully overwrite with real sensor values (avoids stale zeros persisting)
  await set(liveReadingRef, {
    ecg: reading.ecg !== undefined ? reading.ecg : "",
    spo2: reading.spo2 !== undefined ? Number(reading.spo2) : 0,
    bpm: reading.bpm !== undefined ? Number(reading.bpm) : 0,
    temperature: reading.temperature !== undefined ? Number(reading.temperature) : 0,
    updatedAt: Date.now(),
  });
}

/**
 * Appends a reading snapshot to readingsHistory, maintaining exactly the last 10 entries in RTDB.
 */
export async function addReadingToHistory(
  uid: string,
  reading: ReadingsHistoryEntry
): Promise<void> {
  const historyRef = ref(rtdb, `users/${uid}/readingsHistory`);
  const snapshot = await get(historyRef);
  
  let history: any[] = [];
  if (snapshot.exists()) {
    const val = snapshot.val();
    if (Array.isArray(val)) {
      history = val.filter(Boolean);
    } else if (typeof val === 'object') {
      history = Object.values(val);
    }
  }

  const newReading = {
    bpm: reading.bpm !== undefined ? Number(reading.bpm) : 0,
    spo2: reading.spo2 !== undefined ? Number(reading.spo2) : 0,
    temperature: reading.temperature !== undefined ? Number(reading.temperature) : 0,
    ecg: reading.ecg !== undefined ? reading.ecg : "",
    timestamp: reading.timestamp || Date.now()
  };

  history.push(newReading);

  // Enforce 1-hour history constraint (automatically remove older entries)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  history = history.filter(item => {
    const itemTime = item.timestamp ? new Date(item.timestamp).getTime() : 0;
    return itemTime >= oneHourAgo;
  });

  // Limit to maximum 360 readings (1 hour at 10 seconds per reading) to prevent unbound growth
  if (history.length > 360) {
    history = history.slice(-360);
  }

  await set(historyRef, history);
}

/**
 * Updates the emergencyContacts object inside the user's RTDB path.
 */
export async function updateEmergencyContacts(
  uid: string,
  contacts: EmergencyContacts
): Promise<void> {
  const contactsRef = ref(rtdb, `users/${uid}/emergencyContacts`);
  await set(contactsRef, contacts);
}

/**
 * Fetches readings from the last hour saved in PostgreSQL database history logs.
 */
export async function fetchLast10Readings(uid: string): Promise<ReadingsHistoryEntry[]> {
  try {
    const response = await fetch(`http://localhost:5000/api/telemetry/history?patientId=${uid}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.map((item: any) => ({
      bpm: item.bpm !== undefined ? item.bpm : 0,
      spo2: item.spo2 !== undefined ? item.spo2 : 0,
      temperature: item.temperature !== undefined ? item.temperature : 0,
      temperature_c: item.temperature_c !== undefined ? item.temperature_c : 0,
      ecg: item.ecg !== undefined ? item.ecg : "",
      timestamp: item.timestamp || Date.now()
    }));
  } catch (error) {
    console.error('[Firebase Service] Failed to fetch telemetry history from PostgreSQL via API:', error);
    return [];
  }
}
