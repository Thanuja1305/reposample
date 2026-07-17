# Project Structure

This document outlines the codebase layout of HeartSync, defining the responsibilities of every folder and important source files.

## Directory Layout

```text
/
├── docs/                             # Technical guides and system architecture
├── arduino/                          # ESP32 C++ firmware sketches
├── backend/                          # Express server, routes, and services
│   ├── controllers/                  # Controller handlers (e.g. emergencyController)
│   ├── database/                     # PostgreSQL database creation and schema SQL
│   ├── firebase/                     # Firebase Admin SDK setups
│   ├── routes/                       # Express routes (e.g. telemetry, emergency)
│   ├── services/                     # Business services (Twilio, AI Gemini, DB)
│   └── telemetry/                    # Telemetry ingestion, buffer and validation
├── src/                              # React Single Page Application (Vite + TS)
│   ├── frontend/                     # Frontend pages and UI modules
│   │   ├── components/               # Visual UI modules (Siren, Alarm modal)
│   │   ├── context/                  # Authentication and global contexts
│   │   ├── pages/                    # Dashboards, patient registry, and logins
│   │   └── index.css                 # Main Tailwind stylesheet
│   └── shared/                       # Shared modules
│       └── lib/                      # Firebase config initialization
```

## Important Files and Modules

* **[telemetry.service.ts](file:///c:/Users/badat/Downloads/HeartSync-Finalversion-main/HeartSync-Finalversion-main/backend/telemetry/telemetry.service.ts):** Handles telemetry parsing, packet validation, and rolling buffer evaluation.
* **[emergencyController.js](file:///c:/Users/badat/Downloads/HeartSync-Finalversion-main/HeartSync-Finalversion-main/backend/controllers/emergencyController.js):** Coordinates manual alert creation, duplicate alert updates, and database logging.
* **[EmergencyAlertModal.tsx](file:///c:/Users/badat/Downloads/HeartSync-Finalversion-main/HeartSync-Finalversion-main/src/frontend/components/EmergencyAlertModal.tsx):** Displays the critical popup warn modal for doctors with ignore and dispatch options.
* **[EmergencySiren.tsx](file:///c:/Users/badat/Downloads/HeartSync-Finalversion-main/HeartSync-Finalversion-main/src/frontend/components/EmergencySiren.tsx):** Plays offline synthesized sirens using Web Audio API when active alerts are pending.
* **[AuthContext.tsx](file:///c:/Users/badat/Downloads/HeartSync-Finalversion-main/HeartSync-Finalversion-main/src/frontend/context/AuthContext.tsx):** Flat-logs patient/doctor nodes into RTDB and Firestore during session verification.
