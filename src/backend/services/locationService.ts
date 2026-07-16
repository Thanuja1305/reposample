import {
  ref,
  set,
  onValue,
  off
} from 'firebase/database';

import { rtdb } from '../../shared/lib/firebase';

export interface LocationCoords {
  lat: number;
  lng: number;
}

export const locationService = {
  /**
   * START LIVE GPS TRACKING
   */
  async getFallbackIPLocation(): Promise<LocationCoords | null> {
    // Instant fallback coordinates to avoid slow rate-limited HTTP queries on startup
    return { lat: 17.385, lng: 78.4867 };
  },

  async saveLocationToDb(serialNumber: string, data: any) {
    try {
      const mainRef = ref(rtdb, `liveHealthMetrics/${serialNumber}/location`);
      await set(mainRef, data);
      
      const patientRef = ref(rtdb, `patients/${serialNumber}/location`);
      await set(patientRef, data);

      if (serialNumber !== 'HS-001') {
        const fallbackRef = ref(rtdb, 'liveHealthMetrics/HS-001/location');
        await set(fallbackRef, data);
        
        const patientFallbackRef = ref(rtdb, 'patients/HS-001/location');
        await set(patientFallbackRef, data);
      }
    } catch (err) {
      console.error('saveLocationToDb error:', err);
    }
  },

  /**
   * START LIVE GPS TRACKING
   */
  startTracking(
    serialNumber: string,
    onUpdate?: (coords: LocationCoords) => void,
    onError?: (
      error: any
    ) => void
  ) {
    // Geolocation is completely disabled on client/browser.
    // Instead of requesting GPS permissions or calling watchPosition,
    // we use a preset coordinate and update the callback.
    const defaultCoords = { lat: 17.425834775919437, lng: 78.32965949351346 };
    
    // Save to Firebase RTDB using multiplexed helper to simulate live reporting from patient device
    locationService.saveLocationToDb(serialNumber, {
      lat: defaultCoords.lat,
      lng: defaultCoords.lng,
      updatedAt: Date.now(),
      isDefault: true
    }).then(() => {
      if (onUpdate) {
        onUpdate(defaultCoords);
      }
    }).catch((err) => {
      console.warn("Failed to set default coordinates in startTracking:", err);
    });

    return null;
  },

  /**
   * STOP GPS TRACKING
   */
  stopTracking(watchId: any) {
    // No-op since we don't use navigator.geolocation watches
  },

  /**
   * LISTEN TO LIVE LOCATION FROM RTDB
   */
  subscribeToLocation(
    serialNumber: string,
    callback: (
      coords: LocationCoords
    ) => void
  ) {
    const locationRef = ref(
      rtdb,
      `patients/${serialNumber}/location`
    );

    const unsubscribe = onValue(
      locationRef,
      (snapshot) => {
        // Fallback to liveHealthMetrics if not found
        if (!snapshot.exists()) {
          const fallbackRef = ref(rtdb, `liveHealthMetrics/${serialNumber}/location`);
          onValue(fallbackRef, (fallbackSnapshot) => {
            if (fallbackSnapshot.exists()) {
              const data = fallbackSnapshot.val();
              if (data && typeof data.lat === 'number' && typeof data.lng === 'number' && !isNaN(data.lat) && !isNaN(data.lng)) {
                callback({ lat: data.lat, lng: data.lng });
              }
            }
          }, { onlyOnce: true });
          return;
        }

        const data = snapshot.val();

        // VALIDATE
        if (
          data &&
          typeof data.lat === 'number' &&
          typeof data.lng === 'number' &&
          !isNaN(data.lat) &&
          !isNaN(data.lng)
        ) {

          callback({
            lat: data.lat,
            lng: data.lng
          });

        } else {

          console.warn(
            'Invalid RTDB location format'
          );
        }
      }
    );

    return () => {
      off(locationRef);
      unsubscribe();
    };
  }
};