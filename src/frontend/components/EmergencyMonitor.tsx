import React, { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../shared/lib/firebase';
import { emergencyService } from '../../backend/services/emergencyService';

/**
 * Global component that listens for emergency triggers in Firestore.
 * This ensures that if ANY node triggers an emergency, the siren plays 
 * and the UI can react globally.
 */
const EmergencyMonitor: React.FC = () => {
  useEffect(() => {
    // Listen to global emergency status
    const unsub = onSnapshot(doc(db, 'emergencyStatus', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.active) {
          emergencyService.playSiren();
        } else {
          emergencyService.stopSiren();
        }
      }
    });

    return () => unsub();
  }, []);

  return null; // Invisible monitor
};

export default EmergencyMonitor;
