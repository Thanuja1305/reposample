import { ref, onValue } from 'firebase/database';
import { rtdb } from '../../shared/lib/firebase';

export interface LiveVitals {
  patientName: string;
  patientAge: number;
  patientEmail: string;
  serialNumber: string;

  bpm: number;
  spo2: number;
  temperature_c: number;
  humidity: number;

  fingerOn: boolean;
  isAbnormal: boolean;
  emergency: boolean;

  alertReason: string;
  current_condition: string;

  timestamp: number;

  ecgData?: number[];

  location?: {
    lat: number;
    lng: number;
  };
}

/**
 * Subscribe to realtime IoT vitals from Firebase RTDB
 */
export const subscribeToLiveVitals = (
  onUpdate: (vitals: LiveVitals) => void
) => {

  const latestRef = ref(rtdb, 'latest');

  const unsubscribe = onValue(
    latestRef,
    (snapshot) => {

      if (snapshot.exists()) {

        const realtimeVitals = snapshot.val();

        console.log('LIVE RTDB DATA:', realtimeVitals);

        onUpdate(realtimeVitals);

      } else {

        console.log('No realtime sensor data found');

      }

    },
    (error) => {

      console.error('Realtime listener error:', error);

    }
  );

  return unsubscribe;
};