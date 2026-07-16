const db = require('../services/db');

const isValidNumber = (val) => typeof val === 'number' && !isNaN(val);

function validateTelemetry(vitals) {
  if (!vitals) return false;
  
  const { heartRate, bpm, spo2, temperature, temperature_c, temp, humidity } = vitals;
  
  const hr = heartRate !== undefined ? heartRate : bpm;
  const o2 = spo2;
  const tc = temperature !== undefined ? temperature : (temperature_c !== undefined ? temperature_c : temp);
  const hum = humidity;

  if (!isValidNumber(hr) || hr < 0 || hr > 300) return false;
  if (!isValidNumber(o2) || o2 < 0 || o2 > 100) return false;
  if (!isValidNumber(tc) || tc < 0 || tc > 60) return false;
  if (!isValidNumber(hum) || hum < 0 || hum > 100) return false;
  
  return true;
}

async function getTelemetryHistory(req, res) {
  try {
    const { patientId } = req.query;
    const queryStr = `SELECT * FROM telemetry_history WHERE patient_id = $1 ORDER BY timestamp DESC LIMIT 360`;
    const result = await db.query(queryStr, [patientId || 'HS-001']);
    
    // Map database rows to the structure expected by the frontend
    const mapped = result.rows.map(row => ({
      bpm: Number(row.heart_rate),
      spo2: Number(row.spo2),
      temperature: Number(row.temperature_c),
      temperature_c: Number(row.temperature_c),
      humidity: Number(row.humidity),
      condition: row.condition || 'Normal',
      timestamp: row.timestamp.toISOString ? row.timestamp.toISOString() : row.timestamp,
      serialNumber: patientId || 'HS-001'
    }));
    
    res.status(200).json(mapped);
  } catch (error) {
    console.error('[Telemetry Controller] Failed to fetch history from PostgreSQL:', error.message);
    res.status(500).json({ error: error.message });
  }
}

async function addTelemetryEntry(req, res) {
  try {
    const {
      patientId,
      deviceId,
      heartRate,
      bpm,
      spo2,
      temperature,
      temperature_c,
      temp,
      humidity,
      condition,
      latitude,
      longitude
    } = req.body;

    const hr = heartRate !== undefined ? heartRate : (bpm !== undefined ? bpm : 0);
    const o2 = spo2 !== undefined ? spo2 : 0;
    const tc = temperature_c !== undefined ? temperature_c : (temperature !== undefined ? temperature : (temp !== undefined ? temp : 0));
    const hum = humidity !== undefined ? humidity : 0;
    const cond = condition || 'Normal';
    const lat = latitude !== undefined ? Number(latitude) : 17.425834776;
    const lng = longitude !== undefined ? Number(longitude) : 78.329659494;

    const isValid = validateTelemetry({ heartRate: hr, spo2: o2, temperature: tc, humidity: hum });
    if (!isValid) {
      return res.status(400).json({ error: 'Telemetry data failed validation check.' });
    }

    const queryStr = `
      INSERT INTO telemetry_history (patient_id, device_id, heart_rate, spo2, temperature_c, humidity, condition, latitude, longitude, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `;
    const params = [
      patientId || 'HS-001',
      deviceId || 'HS-001',
      hr,
      o2,
      tc,
      hum,
      cond,
      lat,
      lng
    ];

    const result = await db.query(queryStr, params);
    console.log(`[Telemetry Controller] Logged telemetry interval in PostgreSQL for ${patientId || 'HS-001'}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[Telemetry Controller] Failed to log telemetry to PostgreSQL:', error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  validateTelemetry,
  getTelemetryHistory,
  addTelemetryEntry
};
