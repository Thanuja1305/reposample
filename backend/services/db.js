const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let pool = null;
let useFallback = false;

// In-memory mock relational DB store to act as a fallback if no PostgreSQL server is available
const mockDb = {
  hospitals: [],
  doctors: [],
  patients: [],
  devices: [],
  telemetry_history: [],
  alerts: [],
  ai_reports: [],
  chat_history: [],
  medical_profiles: [],
  emergency_contacts: [],
  notifications: [],
  system_logs: []
};

// Check if connection parameters are provided in environment variables
const hasPgConfig = process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD);

if (hasPgConfig) {
  try {
    const config = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.PGHOST,
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE || 'heartsync_db',
          port: parseInt(process.env.PGPORT || '5432', 10),
          ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
        };

    pool = new Pool(config);
    console.log('🐘 PostgreSQL Client pool initialized.');
  } catch (error) {
    console.error('❌ Failed to initialize PostgreSQL pool:', error.message);
    useFallback = true;
  }
} else {
  console.warn('⚠️ No PostgreSQL configuration found in environment variables. Falling back to in-memory relational database.');
  useFallback = true;
}

/**
 * Execute SQL queries against PostgreSQL, or mock relational DB if unavailable.
 */
async function query(text, params) {
  if (useFallback || !pool) {
    return executeMockQuery(text, params);
  }

  try {
    return await pool.query(text, params);
  } catch (error) {
    console.error('❌ PostgreSQL Query Error:', error.message);
    // Auto fallback to mock DB on connection failure to keep the app functional
    if (error.message.includes('connect') || error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
      console.warn('🔄 PostgreSQL connection dropped. Switching to in-memory fallback.');
      useFallback = true;
      return executeMockQuery(text, params);
    }
    throw error;
  }
}

/**
 * Initialize PostgreSQL Schema from backend/database/schema.sql
 */
async function initializeSchema() {
  if (useFallback || !pool) {
    console.log('💾 Using in-memory fallback database. Mock schema initialized.');
    return;
  }

  try {
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    if (!fs.existsSync(schemaPath)) {
      console.warn(`⚠️ Schema file not found at ${schemaPath}. Skipping initialization.`);
      return;
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schemaSql);
    console.log('✅ PostgreSQL Schema initialized successfully.');
  } catch (error) {
    console.error('❌ PostgreSQL Schema Initialization failed:', error.message);
    console.warn('🔄 Switching to in-memory fallback database.');
    useFallback = true;
  }
}

/**
 * A highly lightweight SQL-to-JS parser/simulator for the mock fallback database.
 * This ensures that local testing works flawlessly even if no Postgres database is installed/running.
 */
async function executeMockQuery(text, params = []) {
  const normalizedSql = text.trim().replace(/\s+/g, ' ').toLowerCase();
  
  // 1. SELECT query handling
  if (normalizedSql.startsWith('select')) {
    if (normalizedSql.includes('from telemetry_history')) {
      const patientId = params[0];
      const rows = mockDb.telemetry_history
        .filter(r => !patientId || r.patient_id === patientId)
        .sort((a, b) => b.timestamp - a.timestamp);
      return { rows };
    }
    
    if (normalizedSql.includes('from ai_reports')) {
      const patientId = params[0];
      const rows = mockDb.ai_reports
        .filter(r => !patientId || r.patient_id === patientId)
        .sort((a, b) => b.created_at - a.created_at);
      return { rows };
    }

    if (normalizedSql.includes('from alerts')) {
      const patientId = params[0];
      const rows = mockDb.alerts
        .filter(r => !patientId || r.patient_id === patientId)
        .sort((a, b) => b.detected_at - a.detected_at);
      return { rows };
    }

    if (normalizedSql.includes('from patients')) {
      const patientId = params[0];
      const rows = mockDb.patients.filter(r => !patientId || r.id === patientId);
      return { rows };
    }

    if (normalizedSql.includes('from doctors')) {
      const doctorId = params[0];
      const rows = mockDb.doctors.filter(r => !doctorId || r.id === doctorId);
      return { rows };
    }

    // Default SELECT fallback
    return { rows: [] };
  }

  // 2. INSERT query handling
  if (normalizedSql.startsWith('insert into')) {
    if (normalizedSql.includes('telemetry_history')) {
      // INSERT INTO telemetry_history (patient_id, device_id, heart_rate, spo2, temperature_c, humidity, condition, latitude, longitude, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      const row = {
        id: mockDb.telemetry_history.length + 1,
        patient_id: params[0],
        device_id: params[1],
        heart_rate: params[2],
        spo2: params[3],
        temperature_c: params[4],
        humidity: params[5],
        condition: params[6],
        latitude: params[7],
        longitude: params[8],
        timestamp: new Date()
      };
      mockDb.telemetry_history.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.includes('ai_reports')) {
      // INSERT INTO ai_reports (patient_id, summary, risk_level, abnormal_parameters, recommendation, confidence, vitals_snapshot, created_at)
      const row = {
        id: mockDb.ai_reports.length + 1,
        patient_id: params[0],
        summary: params[1],
        risk_level: params[2],
        abnormal_parameters: params[3],
        recommendation: params[4],
        confidence: params[5],
        vitals_snapshot: params[6],
        created_at: new Date()
      };
      mockDb.ai_reports.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.includes('alerts')) {
      // INSERT INTO alerts (id, patient_id, doctor_id, severity, status, heart_rate_at_trigger, spo2_at_trigger, temp_at_trigger, ai_summary, detected_at)
      const row = {
        id: params[0],
        patient_id: params[1],
        doctor_id: params[2],
        severity: params[3],
        status: params[4],
        heart_rate_at_trigger: params[5],
        spo2_at_trigger: params[6],
        temp_at_trigger: params[7],
        ai_summary: params[8],
        detected_at: params[9] || new Date(),
        created_at: new Date()
      };
      // Prevent duplicates in mock alerts store
      const existingIdx = mockDb.alerts.findIndex(a => a.id === row.id);
      if (existingIdx >= 0) {
        mockDb.alerts[existingIdx] = { ...mockDb.alerts[existingIdx], ...row };
      } else {
        mockDb.alerts.push(row);
      }
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.includes('patients')) {
      const row = { id: params[0], email: params[1], full_name: params[2], created_at: new Date() };
      mockDb.patients.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.includes('doctors')) {
      const row = { id: params[0], email: params[1], full_name: params[2], created_at: new Date() };
      mockDb.doctors.push(row);
      return { rows: [row], rowCount: 1 };
    }
  }

  // 3. UPDATE query handling
  if (normalizedSql.startsWith('update')) {
    if (normalizedSql.includes('alerts')) {
      // UPDATE alerts SET status = $1, resolved_at = $2 WHERE id = $3 OR patient_id = $3
      const status = params[0];
      const resolvedAt = params[1] || new Date();
      const matchId = params[2];
      
      let updatedCount = 0;
      mockDb.alerts.forEach(a => {
        if ((a.id === matchId || a.patient_id === matchId) && a.status !== 'RESOLVED') {
          a.status = status;
          a.resolved_at = resolvedAt;
          updatedCount++;
        }
      });
      return { rowCount: updatedCount };
    }
  }

  return { rows: [], rowCount: 0 };
}

module.exports = {
  query,
  initializeSchema,
  isFallback: () => useFallback
};
