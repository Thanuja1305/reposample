# HeartSync

HeartSync is an advanced IoT healthcare monitoring and emergency dispatch system designed to capture, analyze, and visualize real-time physiological telemetry, and trigger sequential medical alerts during cardiac distress.

## Project Overview
HeartSync bridges the gap between patient vitals collected by IoT sensors (ECG, heart rate, blood oxygen levels, and temperature) and clinical interventions. It streams telemetry to Firebase, evaluates physiological hazards in real time, and automates doctor notifications and Twilio emergency dispatches when critical hazards are verified.

## Problem Statement
Standard remote monitoring systems suffer from:
1. High false alarm rates due to sensor movement, initialization values (0 BPM/SpO₂), or temporary finger removal.
2. Inconsistent notification channels during true life-threatening emergencies.
3. Lack of unified real-time synchronization between patients, IoT hardware, and clinical registries.

## Proposed Solution
HeartSync addresses these challenges via:
* **Robust Telemetry Validation:** Ignores startup values, disconnected leads, and offline spikes.
* **Rolling Validation Buffer:** Evaluates a window of the last 10 valid samples, requiring a 60% critical majority to trigger an emergency alert.
* **Master Triage Pipeline:** Synchronizes real-time status, siren alarms, ambulance dispatches, and Twilio calls/SMS without page refreshes.

## Technology Stack
* **Frontend:** React, Vite, TypeScript, Tailwind CSS, Lucide icons, Leaflet.
* **Backend:** Node.js, Express APIs, TypeScript.
* **Database:** Firebase Realtime Database (RTDB), Cloud Firestore, PostgreSQL.
* **AI:** Google Gemini AI.
* **Telephony:** Twilio API (SMS, WhatsApp, Voice Calls).

## Folder Structure
```text
/
├── docs/                     # Project technical documentation
├── src/                      # React frontend codebase
│   ├── frontend/             # Pages, components, and contexts
│   └── shared/               # Shared libraries (Firebase, styles)
├── backend/                  # Node.js backend codebase
│   ├── telemetry/            # Telemetry services and controllers
│   ├── controllers/          # Emergency, dispatch, and AI controllers
│   └── routes/               # API endpoints
└── arduino/                  # ESP32 C++ firmware files
```

## Running Locally
Refer to the [Environment Setup Guide](./ENVIRONMENT_SETUP.md) and [Deployment Guide](./DEPLOYMENT_GUIDE.md) for details on installing dependencies and running the local development servers.

---
*Created by the HeartSync engineering team.*
