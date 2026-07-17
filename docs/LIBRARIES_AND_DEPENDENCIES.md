# Libraries and Dependencies

This document provides a breakdown of the primary third-party libraries and frameworks used in the HeartSync project and their roles.

## Frontend Dependencies

### 1. React & Vite
* **Purpose:** Single Page Application rendering and super-fast HMR local build tooling.
* **Why:** High rendering efficiency and modern component ecosystem.

### 2. Firebase JS SDK
* **Purpose:** Direct client integration for Authentication, Cloud Firestore, and Realtime Database listeners.
* **Why:** Simplifies reactive real-time database value subscriptions on patient and doctor screens.

### 3. Leaflet & React-Leaflet
* **Purpose:** Interactive maps rendering for emergency responder trackings.
* **Why:** Lightweight open-source map library requiring no complex API billing.

### 4. Lucide-React
* **Purpose:** Vector styling icons.
* **Why:** Clean, customizable icon set matching Tailwind layout parameters.

---

## Backend Dependencies

### 1. Firebase Admin SDK (`firebase-admin`)
* **Purpose:** Authorized write permissions to the Realtime Database directly from backend telemetry processes.
* **Why:** Essential for writing verified sensor indicators secure from client interception.

### 2. Google Gemini AI SDK (`@google/generative-ai`)
* **Purpose:** Processes clinical signals to output diagnostic assessments.
* **Why:** High-performance natural language generation for instant cardiac status classifications.

### 3. Twilio SDK (`twilio`)
* **Purpose:** Powers outgoing alarm phone calls, SMS messaging alerts, and WhatsApp messages.
* **Why:** Standard telecom integration provider with sandbox test modes.
