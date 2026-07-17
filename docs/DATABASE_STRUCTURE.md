# Database Structure

HeartSync utilizes a hybrid data layer architecture combining Firebase Realtime Database (for streaming and alerts), Cloud Firestore (for configurations), and PostgreSQL (for historical audit logs).

## Firebase Realtime Database (RTDB) Schema

### 1. `users/{userId}`
* **Purpose:** Stores flattened user profile details and clinical status.
* **Fields:** `uid`, `role` (patient/doctor), `status` (approved/pending), `profile` (`name`, `age`, `gender`, `bloodGroup`, `address`).

### 2. `Patients/{patientId}/liveReading`
* **Purpose:** Stream destination of current validated IoT telemetry for the patient dashboard.
* **Fields:** `heartRate`, `spo2`, `temperature`, `humidity`, `ecgSegment` (array), `sensorStatus`, `deviceStatus` (ONLINE/OFFLINE), `timestamp`.

### 3. `liveReadings/{patientId}`
* **Purpose:** Holds the primary real-time vitals mapped in the clinical registry grid.
* **Fields:** `heartRate`, `spo2`, `temperature`, `humidity`, `ecgSegment`, `condition` (Normal/Abnormal/Critical), `deviceStatus`, `timestamp`.

### 4. `alerts/{alertId}`
* **Purpose:** Core alert registry containing unresolved and resolved emergency notifications.
* **Fields:** `patientId`, `doctorId`, `status` (pending/resolved/dispatched/ignored), `severity` (critical), `patientName`, `age`, `gender`, `bloodGroup`, `vitals` (object), `location` (`lat`, `lng`), `deviceStatus`, `resolved`, `acknowledged`.

---

## Cloud Firestore Schema

### 1. `users` Collection
* **Documents:** `{userId}`
* **Fields:** `uid`, `role`, `status`, `name`, `email`, `phoneNumber`.

### 2. `emergencyAlerts` Collection
* **Documents:** `{patientId}`
* **Fields:** `patientId`, `status` (pending/resolved), `severity` (critical), `timestamp`, `emergency` (boolean).

---

## PostgreSQL Database Schema

### 1. `telemetry_history` Table
* Logs 15-second aggregated telemetry readings containing `heart_rate`, `spo2`, `temperature_c`, `humidity`, and coordinates.

### 2. `alerts` Table
* Logs every generated alert with its physiological values at trigger time and doctor actions.
