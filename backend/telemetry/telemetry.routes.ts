import { Router } from 'express';
import { streamTelemetry } from './telemetry.controller';

// Import legacy JavaScript controllers to maintain full backward compatibility
// @ts-ignore
import { getTelemetryHistory, addTelemetryEntry } from '../controllers/telemetryController';

const router = Router();

// New HTTP POST endpoint for ESP32 telemetry streaming
router.post('/stream', streamTelemetry);

// Legacy telemetry log and history endpoints
router.get('/history', getTelemetryHistory);
router.post('/log', addTelemetryEntry);

export default router;
