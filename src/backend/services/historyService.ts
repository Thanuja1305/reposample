import { ref, push, set, query, orderByChild, endAt, get, remove } from 'firebase/database';
import { rtdb } from '../../shared/lib/firebase';
import { API_BASE_URL } from './apiConfig';

export const historyService = {
  /**
   * Saves a snapshot of vitals to history and cleans up old records (>1hr)
   */
  async logVitals(serialNumber: string, data: any) {
    if (!data) return;

    try {
      const historyRef = ref(rtdb, `history/${serialNumber}`);
      const timestamp = Date.now();

      // 1. Save new history record
      const newRecordRef = push(historyRef);
      await set(newRecordRef, {
        bpm: data.bpm || 0,
        spo2: data.spo2 || 0,
        humidity: data.humidity || 0,
        temperature_c: data.temperature_c || 0,
        emergency: data.emergency || false,
        isAbnormal: data.isAbnormal || false,
        patientName: (data.patientName && data.patientName !== 'Unknown' && data.patientName !== 'Patient') ? data.patientName : (data.name || ''),
        patientAge: data.patientAge || data.age || '',
        patientEmail: data.patientEmail || data.email || '',
        serialNumber: data.serialNumber || serialNumber,
        alertReason: data.alertReason || '',
        timestamp: timestamp
      });

      console.log(`[History] Record saved for ${serialNumber}`);

      // 2. Automatic Cleanup (records older than 1 hour)
      const oneHourAgo = timestamp - (60 * 60 * 1000);
      
      const snapshot = await get(historyRef);
      if (snapshot.exists()) {
        const allRecords = snapshot.val();
        const deletePromises: Promise<void>[] = [];
        Object.entries(allRecords).forEach(([key, val]: [string, any]) => {
          if (val && val.timestamp && val.timestamp <= oneHourAgo) {
            deletePromises.push(remove(ref(rtdb, `history/${serialNumber}/${key}`)));
          }
        });
        if (deletePromises.length > 0) {
          await Promise.all(deletePromises);
          console.log(`[History] Cleaned up ${deletePromises.length} old records`);
        }
      }
    } catch (error) {
      console.error('[History] Logging failed:', error);
    }
  },

  /**
   * Fetches the last 1 hour of history for a patient from PostgreSQL database
   */
  async getHistory(serialNumber: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/telemetry/history?patientId=${serialNumber}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[History] Fetch failed from PostgreSQL via API:', error);
      return [];
    }
  }
};
