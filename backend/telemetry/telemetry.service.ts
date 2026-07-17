import { rtdbAdmin } from '../firebase/firebaseAdmin';
import { db } from '../services/dataConnectService';
import { generateReport } from '../services/aiService';

export interface TelemetryPacket {
  patientUid: string;
  deviceId: string;
  heartRate: number;
  spo2: number;
  temperature: number;
  humidity: number;
  ecgSegment: number[];
  sensorStatus: string;
  createdAt?: Date;
}

class TelemetryService {
  private buffer60s: TelemetryPacket[] = [];
  private buffer15s: TelemetryPacket[] = [];

  constructor() {
    // 60-second batch insert into Firebase Data Connect tables (Patient, Device, VitalReading)
    setInterval(() => this.flush60sBuffer(), 60000);

    // 15-second aggregated insert into telemetry_history and ecg_segments
    setInterval(() => this.flush15sAggregate(), 15000);
  }

  public async handleTelemetry(packet: TelemetryPacket): Promise<void> {
    const {
      patientUid,
      deviceId,
      heartRate,
      spo2,
      temperature,
      humidity,
      ecgSegment,
      sensorStatus,
    } = packet;

    console.log(`[Telemetry] ${deviceId} received`);

    const timestamp = Math.floor(Date.now() / 1000);

    // 1. Update Firebase RTDB paths
    try {
      if (rtdbAdmin) {
        // Path A: devices/{deviceId}
        const deviceRef = rtdbAdmin.ref(`devices/${deviceId}`);
        await deviceRef.update({
          patientUid,
          deviceStatus: 'connected',
          lastHeartbeat: Date.now(),
          liveReading: {
            heartRate,
            spo2,
            temperature,
            humidity,
            ecgSegment,
            sensorStatus,
            timestamp,
          },
        });
        console.log(`[Firebase] RTDB devices updated for ${deviceId}`);

        // Path B: liveReadings/{patientUid} (Instantaneous update as requested)
        const liveReadingsRef = rtdbAdmin.ref(`liveReadings/${patientUid}`);
        await liveReadingsRef.update({
          heartRate,
          spo2,
          temperature,
          humidity,
          ecgSegment,
          latestEcgSegment: ecgSegment,
          sensorStatus,
          deviceStatus: 'ONLINE',
          timestamp: Date.now(),
          condition: heartRate > 120 || spo2 < 90 ? 'Critical' : 'Normal',
        });
        console.log(`[Firebase] RTDB liveReadings updated for ${patientUid}`);

        // Path C: users/{patientUid}/liveReading (legacy frontend compatibility)
        const userLiveRef = rtdbAdmin.ref(`users/${patientUid}/liveReading`);
        await userLiveRef.update({
          ecg: ecgSegment && ecgSegment.length > 0 ? ecgSegment[0] : 0,
          spo2,
          bpm: heartRate,
          heartRate,
          temperature,
          updatedAt: Date.now(),
          ecgData: ecgSegment,
          sensorStatus,
          location: {
            latitude: 17.425834776,
            longitude: 78.329659494
          }
        });

        // Path D: patients/{patientUid}/liveVitals (legacy Patient Dashboard compatibility)
        const patientVitalsRef = rtdbAdmin.ref(`patients/${patientUid}/liveVitals`);
        await patientVitalsRef.update({
          heartRate,
          bpm: heartRate,
          spo2,
          temperature: temperature,
          temperature_c: temperature,
          humidity,
          ecgData: ecgSegment,
          sensorStatus,
          condition: heartRate > 120 || spo2 < 90 ? 'Critical' : 'Normal',
          timestamp: Date.now(),
          emergency: heartRate > 120 || spo2 < 90,
        });

        // Path E: Patients/{patientUid}/liveReading (New unified Realtime Database path)
        const newPatientLiveRef = rtdbAdmin.ref(`Patients/${patientUid}/liveReading`);
        await newPatientLiveRef.update({
          heartRate,
          spo2,
          temperature,
          humidity,
          ecgSegment,
          sensorStatus,
          deviceStatus: 'ONLINE',
          timestamp: Date.now(),
        });

      }
    } catch (firebaseError: any) {
      console.error('[Firebase] Error updating RTDB paths:', firebaseError.message);
    }

    // Trigger AI Diagnosis Report generation asynchronously in background (always runs, including mock database fallback)
    generateReport({
      patientId: patientUid,
      heartRate,
      spo2,
      temperature,
      humidity,
      sensorStatus,
      ecgStatus: heartRate > 120 || spo2 < 90 ? 'Critical' : 'Normal'
    }).catch(err => console.error('[Telemetry Service] AI generation failed:', err.message));

    // 2. Add to both buffers
    const enrichedPacket = { ...packet, createdAt: new Date() };
    this.buffer60s.push(enrichedPacket);
    this.buffer15s.push(enrichedPacket);
  }

  /**
   * Every 15 seconds, aggregate recent telemetry packets and write a single clean row
   * into postgres tables telemetry_history and ecg_segments.
   */
  private async flush15sAggregate(): Promise<void> {
    if (this.buffer15s.length === 0) {
      return;
    }

    const packets = [...this.buffer15s];
    this.buffer15s = [];

    console.log(`[DataConnect] Aggregating ${packets.length} packets for 15s interval insert...`);

    // Group packets by patientUid
    const groups: { [key: string]: TelemetryPacket[] } = {};
    for (const p of packets) {
      if (!groups[p.patientUid]) {
        groups[p.patientUid] = [];
      }
      groups[p.patientUid].push(p);
    }

    for (const patientUid of Object.keys(groups)) {
      const patientPackets = groups[patientUid];
      const count = patientPackets.length;

      // Calculate averages
      let totalHr = 0, totalO2 = 0, totalTemp = 0, totalHum = 0;
      for (const p of patientPackets) {
        totalHr += p.heartRate;
        totalO2 += p.spo2;
        totalTemp += p.temperature;
        totalHum += p.humidity;
      }
      const avgHr = Math.round(totalHr / count);
      const avgO2 = Number((totalO2 / count).toFixed(2));
      const avgTemp = Number((totalTemp / count).toFixed(2));
      const avgHum = Number((totalHum / count).toFixed(2));

      // Get latest status and ECG data
      const latestPacket = patientPackets[count - 1];
      const deviceId = latestPacket.deviceId;
      const ecgWaveformStr = latestPacket.ecgSegment.join(',');
      const sensorStatus = latestPacket.sensorStatus;

      // Classify condition
      let condition = 'Normal';
      if (avgHr > 120 || avgHr < 50 || avgO2 < 90 || avgTemp > 39 || avgTemp < 35) {
        condition = 'Critical';
      } else if (avgHr > 100 || avgHr < 60 || avgO2 < 95 || avgTemp > 38 || avgTemp < 36) {
        condition = 'Abnormal';
      }

      const latitude = 17.425834776;
      const longitude = 78.329659494;

      try {
        // Step A: Insert into telemetry_history
        const telHistoryQuery = `
          INSERT INTO telemetry_history (patient_id, device_id, heart_rate, spo2, temperature_c, humidity, condition, latitude, longitude, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          RETURNING id
        `;
        const telResult = await db.query(telHistoryQuery, [
          patientUid,
          deviceId,
          avgHr,
          avgO2,
          avgTemp,
          avgHum,
          condition,
          latitude,
          longitude
        ]);

        const telemetryId = telResult.rows[0]?.id;

        // Step B: Insert into ecg_segments linking to the telemetry_id
        if (telemetryId && ecgWaveformStr) {
          const ecgQuery = `
            INSERT INTO ecg_segments (patient_id, telemetry_id, waveform_data, status, timestamp)
            VALUES ($1, $2, $3, $4, NOW())
          `;
          await db.query(ecgQuery, [
            patientUid,
            telemetryId,
            ecgWaveformStr,
            sensorStatus
          ]);
        }

        console.log(`[DataConnect] 15s aggregate telemetry_history + ecg_segments inserted successfully for ${patientUid}`);
      } catch (dbErr: any) {
        console.error(`[DataConnect] Failed to write 15s aggregated data for ${patientUid}:`, dbErr.message);
      }
    }
  }

  /**
   * Every 60 seconds, flush the raw data into Patient, Device, and VitalReading tables.
   */
  private async flush60sBuffer(): Promise<void> {
    if (this.buffer60s.length === 0) {
      return;
    }

    const packetsToInsert = [...this.buffer60s];
    this.buffer60s = [];

    console.log(`[DataConnect] Historical record insertion starting for ${packetsToInsert.length} buffered packets.`);

    try {
      for (const packet of packetsToInsert) {
        // Step A: Ensure patient exists in PostgreSQL
        await db.query(
          `INSERT INTO "Patient" (id, uid, name, age, gender)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [packet.patientUid, packet.patientUid, `Patient ${packet.patientUid}`, 30, 'Nominal']
        );

        // Step B: Ensure device exists in PostgreSQL
        await db.query(
          `INSERT INTO "Device" (id, "deviceId", "patientUid", "createdAt")
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [packet.deviceId, packet.deviceId, packet.patientUid, new Date()]
        );

        // Step C: Insert vital reading record
        await db.query(
          `INSERT INTO "VitalReading" ("deviceId", "patientUid", "heartRate", spo2, temperature, humidity, "ecgSegment", "sensorStatus", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            packet.deviceId,
            packet.patientUid,
            packet.heartRate,
            packet.spo2,
            packet.temperature,
            packet.humidity,
            JSON.stringify(packet.ecgSegment),
            packet.sensorStatus,
            packet.createdAt || new Date(),
          ]
        );
      }
      console.log(`[DataConnect] Historical records batch inserted successfully.`);
    } catch (dbError: any) {
      console.error('[DataConnect] Batch insert to PostgreSQL failed:', dbError.message);
    }
  }
}

export const telemetryService = new TelemetryService();
