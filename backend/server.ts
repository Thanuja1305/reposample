import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

// Import services and configurations
// @ts-ignore
import dbService from './services/db';
import { initializeDataConnectSchema } from './services/dataConnectService';
import { startHeartbeatMonitor } from './services/heartbeatMonitor';

// Import routers
// @ts-ignore
import emergencyRouter from './routes/emergency';
// @ts-ignore
import aiRouter from './routes/ai';
import telemetryRouter from './telemetry/telemetry.routes';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Mount API routes
app.use('/api/emergency', emergencyRouter);
app.use('/api/ai', aiRouter);
app.use('/api/reports', aiRouter); // Mount for reports history endpoint compatibility
app.use('/api/telemetry', telemetryRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'HeartSync Backend is running' });
});

// Auto-initialize DB schemas on startup
const initializeSchemas = async () => {
  try {
    // 1. Initialize PostgreSQL schemas (legacy tables)
    await dbService.initializeSchema();
    console.log('🐘 PostgreSQL legacy schema checked and initialized.');
  } catch (err: any) {
    console.error('❌ Failed to initialize legacy database schema:', err.message);
  }

  try {
    // 2. Initialize Firebase Data Connect relational schemas
    await initializeDataConnectSchema();
  } catch (err: any) {
    console.error('❌ Failed to initialize Firebase Data Connect database schema:', err.message);
  }
};

initializeSchemas();

// Start the Heartbeat status monitoring checker (runs every 5 seconds)
startHeartbeatMonitor();

// Start the Express server
app.listen(PORT, () => {
  console.log(`🚀 HeartSync Backend Server (Stateless HTTP) is running on port ${PORT}`);
});
