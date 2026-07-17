import { rtdbAdmin } from '../firebase/firebaseAdmin';

export function startHeartbeatMonitor(): void {
  console.log('[Heartbeat Monitor] Initializing interval check (every 3 seconds)');

  setInterval(async () => {
    try {
      if (!rtdbAdmin) {
        // Safe logging when Firebase Admin is not fully initialized
        return;
      }

      const devicesRef = rtdbAdmin.ref('devices');
      const snapshot = await devicesRef.once('value');

      if (!snapshot.exists()) {
        return;
      }

      const devices = snapshot.val();
      const currentTime = Date.now();

      for (const deviceId of Object.keys(devices)) {
        const device = devices[deviceId];
        const lastHeartbeat = device.lastHeartbeat;

        if (lastHeartbeat) {
          const difference = currentTime - lastHeartbeat;
          // If no heartbeat for > 3 seconds (allows instant offline marking)
          if (difference > 3000 && device.deviceStatus !== 'disconnected') {
            console.log(`[Heartbeat Monitor] Device ${deviceId} missed heartbeats (${Math.round(difference / 1000)}s ago). Marking disconnected.`);
            await devicesRef.child(`${deviceId}`).update({
              deviceStatus: 'disconnected'
            });

            const pUid = device.patientUid;
            if (pUid) {
              try {
                await rtdbAdmin.ref(`Patients/${pUid}/liveReading`).update({
                  deviceStatus: 'disconnected',
                  timestamp: Date.now()
                });
                await rtdbAdmin.ref(`patients/${pUid}/liveVitals`).update({
                  deviceStatus: 'disconnected',
                  timestamp: Date.now()
                });
                await rtdbAdmin.ref(`liveReadings/${pUid}`).update({
                  deviceStatus: 'disconnected',
                  timestamp: Date.now()
                });
              } catch (updateErr: any) {
                console.error(`[Heartbeat Monitor] Failed to update patient paths:`, updateErr.message);
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[Heartbeat Monitor] Error running periodic heartbeat check:', error.message);
    }
  }, 3000);
}
