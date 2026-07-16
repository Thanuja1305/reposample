const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const WebSocket = require('ws');
const { ref, onValue } = require('firebase/database');

const emergencyRouter = require('./routes/emergency');
const aiRouter = require('./routes/ai');
const telemetryRouter = require('./routes/telemetry');
const db = require('./services/db');
const { rtdb } = require('./services/firebaseService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/emergency', emergencyRouter);
app.use('/api/ai', aiRouter);
app.use('/api/reports', aiRouter); // Mount /api/reports for history endpoint compatibility
app.use('/api/telemetry', telemetryRouter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'HeartSync Backend is running' });
});

// Auto-initialize DB schema on startup
db.initializeSchema().then(() => {
  console.log('🐘 PostgreSQL database schema checked and initialized.');
}).catch(err => {
  console.error('❌ Failed to initialize database schema:', err.message);
});

const server = app.listen(PORT, () => {
  console.log(`🚀 HeartSync Backend Server is running on port ${PORT}`);
});

// Setup WebSocket server for direct ESP32 telemetry pushes
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  console.log('[WS] New client connected');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('[WS] Received telemetry snapshot:', data);
      
      const patientId = data.patientId || 'HS-001';
      const deviceId = data.deviceId || 'HS-001';
      const hr = data.heartRate !== undefined ? data.heartRate : (data.bpm !== undefined ? data.bpm : 0);
      const o2 = data.spo2 !== undefined ? data.spo2 : 0;
      const tc = data.temperature_c !== undefined ? data.temperature_c : (data.temperature !== undefined ? data.temperature : (data.temp !== undefined ? data.temp : 0));
      const hum = data.humidity !== undefined ? data.humidity : 0;
      const cond = data.condition || 'Normal';
      const lat = data.latitude !== undefined ? Number(data.latitude) : 17.425834776;
      const lng = data.longitude !== undefined ? Number(data.longitude) : 78.329659494;

      const queryStr = `
        INSERT INTO telemetry_history (patient_id, device_id, heart_rate, spo2, temperature_c, humidity, condition, latitude, longitude, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `;
      await db.query(queryStr, [patientId, deviceId, Math.round(hr), Number(o2), Number(tc), Number(hum), cond, lat, lng]);
      console.log(`[WS] Successfully logged telemetry entry in PostgreSQL for ${patientId}`);
    } catch (err) {
      console.error('[WS] Error processing WebSocket telemetry message:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

// Background Telemetry Parser
// Listen for changes to the Firebase RTDB path patients/HS-001/liveVitals
let latestVitals = null;
try {
  const liveVitalsRef = ref(rtdb, 'patients/HS-001/liveVitals');
  onValue(liveVitalsRef, (snapshot) => {
    if (snapshot.exists()) {
      latestVitals = snapshot.val();
    }
  }, (error) => {
    console.error('[RTDB Listener] Error reading liveVitals:', error.message);
  });
  console.log('📡 Background telemetry listener registered on RTDB patients/HS-001/liveVitals.');
} catch (rtdbErr) {
  console.error('[RTDB Listener] Failed to initialize RTDB listener:', rtdbErr.message);
}

// Every 15 seconds, validate the telemetry readings and insert a historical record into PostgreSQL
setInterval(async () => {
  if (!latestVitals) return;

  try {
    const hr = latestVitals.heartRate !== undefined ? latestVitals.heartRate : (latestVitals.bpm !== undefined ? latestVitals.bpm : 0);
    const o2 = latestVitals.spo2 !== undefined ? latestVitals.spo2 : 0;
    const tc = latestVitals.temperature_c !== undefined ? latestVitals.temperature_c : (latestVitals.temperature !== undefined ? latestVitals.temperature : 0);
    const hum = latestVitals.humidity !== undefined ? latestVitals.humidity : 0;

    // Basic bounds check (matching validateTelemetry logic)
    const isValid = hr >= 0 && hr <= 300 && o2 >= 0 && o2 <= 100 && tc >= 0 && tc <= 60 && hum >= 0 && hum <= 100;
    if (!isValid) {
      console.warn('[Telemetry Parser] Invalid telemetry values skipped:', latestVitals);
      return;
    }

    let condition = 'Normal';
    if (hr > 120 || hr < 50 || o2 < 90 || tc > 39 || tc < 35) {
      condition = 'Critical';
    } else if (hr > 100 || hr < 60 || o2 < 95 || tc > 38 || tc < 36) {
      condition = 'Abnormal';
    }

    const queryStr = `
      INSERT INTO telemetry_history (patient_id, device_id, heart_rate, spo2, temperature_c, humidity, condition, latitude, longitude, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `;
    const params = [
      'HS-001',
      'HS-001',
      Math.round(hr),
      Number(o2),
      Number(tc),
      Number(hum),
      condition,
      17.425834776,
      78.329659494
    ];

    await db.query(queryStr, params);
    console.log('[Telemetry Parser] 15s interval: historical telemetry saved in PostgreSQL.');
  } catch (err) {
    console.error('[Telemetry Parser] Failed to insert historical telemetry:', err.message);
  }
}, 15000);
