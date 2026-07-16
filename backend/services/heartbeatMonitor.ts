import { rtdbAdmin } from '../firebase/firebaseAdmin';

export function startHeartbeatMonitor(): void {
  console.log('[Heartbeat Monitor] Initializing interval check (every 5 seconds)');

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
          // If no heartbeat for > 5 seconds (allows instant offline marking)
          if (difference > 5000 && device.deviceStatus !== 'disconnected') {
            console.log(`[Heartbeat Monitor] Device ${deviceId} missed heartbeats (${Math.round(difference / 1000)}s ago). Marking disconnected.`);
            await devicesRef.child(`${deviceId}`).update({
              deviceStatus: 'disconnected'
            });
          }
        }
      }
    } catch (error: any) {
      console.error('[Heartbeat Monitor] Error running periodic heartbeat check:', error.message);
    }
  }, 5000);
}
