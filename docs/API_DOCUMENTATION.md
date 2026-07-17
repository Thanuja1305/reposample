# API Documentation

HeartSync exposes standard REST endpoints to coordinate telemetry, dispatches, and diagnostics.

## Ingest Telemetry
* **Endpoint:** `POST /api/telemetry`
* **Description:** Receives physical signals from the ESP32.
* **Payload:**
```json
{
  "patientUid": "m1uph2bX7SVd9Wbyge1AMqAmq093",
  "deviceId": "HS-001",
  "heartRate": 72,
  "spo2": 98,
  "temperature": 36.8,
  "humidity": 50,
  "ecgSegment": [342, 345, 340],
  "sensorStatus": "FINGER_DETECTED"
}
```

---

## Log Emergency Alert
* **Endpoint:** `POST /api/emergency/send-alert`
* **Description:** Generates a new critical pending alert or updates an existing alert.
* **Payload:**
```json
{
  "patientId": "m1uph2bX7SVd9Wbyge1AMqAmq093",
  "patientName": "Shivani",
  "age": 24,
  "heartRate": 145,
  "spo2": 82,
  "temperature_c": 37.2,
  "humidity": 45,
  "latitude": 17.425834776,
  "longitude": 78.329659494,
  "deviceStatus": "ONLINE"
}
```

---

## Dispatch Responders (Twilio Sequential Alarm)
* **Endpoint:** `POST /api/emergency/dispatch`
* **Description:** Initiates sequential Twilio voice calls, SMS notifications, and WhatsApp updates.
* **Payload:**
```json
{
  "patientUid": "m1uph2bX7SVd9Wbyge1AMqAmq093"
}
```
