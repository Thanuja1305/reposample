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

// Production CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3006',
  'http://localhost:3007',
  'http://localhost:3008',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
  process.env.VITE_BACKEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, ESP32, curl)
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(null, true); // Fallback allow for dynamic Vercel previews
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// Mount API routes
app.use('/api/emergency', emergencyRouter);
app.use('/api/ai', aiRouter);
app.use('/api/reports', aiRouter); // Mount for reports history endpoint compatibility
app.use('/api/telemetry', telemetryRouter);

// Health check endpoint (Phase 4 requirement)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'running',
    service: 'HeartSync Backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Express Global Error Handler (Phase 4 requirement)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Express Global Error Handler:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    status: 'error'
  });
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

// Start the Express server (bound to 0.0.0.0 for Render / Railway port scanner)
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 HeartSync Backend Server is running on port ${PORT} (host: 0.0.0.0)`);
});
