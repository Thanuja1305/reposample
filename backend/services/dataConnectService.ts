import dbService from './db';

// Ensure the schema is ready for Firebase Data Connect emulation/relational storage
export async function initializeDataConnectSchema(): Promise<void> {
  try {
    console.log('[DataConnect] Ensuring Patient, Device, and VitalReading tables exist...');

    // Patient schema (id, uid, name, age, gender)
    await dbService.query(`
      CREATE TABLE IF NOT EXISTS "Patient" (
        id VARCHAR(128) PRIMARY KEY,
        uid VARCHAR(128) UNIQUE,
        name VARCHAR(255),
        age INT,
        gender VARCHAR(20)
      );
    `);

    // Device schema (id, deviceId, patientUid, createdAt)
    await dbService.query(`
      CREATE TABLE IF NOT EXISTS "Device" (
        id VARCHAR(128) PRIMARY KEY,
        "deviceId" VARCHAR(128),
        "patientUid" VARCHAR(128),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // VitalReading schema (id, deviceId, patientUid, heartRate, spo2, temperature, humidity, ecgSegment JSON, sensorStatus, createdAt)
    await dbService.query(`
      CREATE TABLE IF NOT EXISTS "VitalReading" (
        id SERIAL PRIMARY KEY,
        "deviceId" VARCHAR(128),
        "patientUid" VARCHAR(128),
        "heartRate" INT,
        spo2 NUMERIC(5, 2),
        temperature NUMERIC(5, 2),
        humidity NUMERIC(5, 2),
        "ecgSegment" JSONB,
        "sensorStatus" VARCHAR(50),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('[DataConnect] Firebase Data Connect tables verified and initialized.');
  } catch (err: any) {
    console.error('[DataConnect] Failed to ensure schema tables exist:', err.message);
  }
}

// Export queries interface matching PostgreSQL Pool
export const db = {
  query: (text: string, params?: any[]) => dbService.query(text, params),
};
