import { Request, Response } from 'express';
import { telemetryService } from './telemetry.service';

export async function streamTelemetry(req: Request, res: Response): Promise<Response> {
  try {
    const {
      patientUid,
      deviceId,
      heartRate,
      spo2,
      temperature,
      humidity,
      ecgSegment,
      sensorStatus,
    } = req.body;

    // Validate identifiers
    if (!patientUid || !deviceId) {
      console.error('[Telemetry] Invalid payload: Missing patientUid or deviceId');
      return res.status(400).json({ error: 'Missing patientUid or deviceId' });
    }

    // Validate sensor values
    const hr = Number(heartRate);
    const o2 = Number(spo2);
    const temp = Number(temperature);
    const hum = Number(humidity);

    // Heart Rate: 20 BPM - 220 BPM
    if (isNaN(hr) || hr < 20 || hr > 220) {
      console.error(`[Telemetry] Validation failed: heartRate ${heartRate} is invalid`);
      return res.status(400).json({ error: 'Invalid heartRate. Must be between 20 and 220 BPM.' });
    }

    // SpO2: 70% - 100%
    if (isNaN(o2) || o2 < 70 || o2 > 100) {
      console.error(`[Telemetry] Validation failed: spo2 ${spo2} is invalid`);
      return res.status(400).json({ error: 'Invalid spo2. Must be between 70% and 100%.' });
    }

    // Temperature: 30°C - 45°C
    if (isNaN(temp) || temp < 30 || temp > 45) {
      console.error(`[Telemetry] Validation failed: temperature ${temperature} is invalid`);
      return res.status(400).json({ error: 'Invalid temperature. Must be between 30°C and 45°C.' });
    }

    // Humidity: 0% - 100%
    if (isNaN(hum) || hum < 0 || hum > 100) {
      console.error(`[Telemetry] Validation failed: humidity ${humidity} is invalid`);
      return res.status(400).json({ error: 'Invalid humidity. Must be between 0% and 100%.' });
    }

    // Process valid telemetry
    await telemetryService.handleTelemetry({
      patientUid,
      deviceId,
      heartRate: hr,
      spo2: o2,
      temperature: temp,
      humidity: hum,
      ecgSegment: Array.isArray(ecgSegment) ? ecgSegment : [],
      sensorStatus: sensorStatus || 'nominal',
    });

    return res.status(202).json({
      success: true,
      message: 'Telemetry accepted',
    });
  } catch (error: any) {
    console.error('[Telemetry] Error in streamTelemetry controller:', error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
