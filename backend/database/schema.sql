-- HeartSync Relational Database Schema (PostgreSQL)

-- 1. Hospital Directory Table
CREATE TABLE IF NOT EXISTS hospitals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    emergency_status VARCHAR(50),
    beds_available INT DEFAULT 0,
    icu_available INT DEFAULT 0,
    contact_number VARCHAR(50),
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Doctor Registry Table (Syncs with Firebase Auth / RTDB Role)
CREATE TABLE IF NOT EXISTS doctors (
    id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    specialization VARCHAR(255),
    qualification VARCHAR(255),
    experience VARCHAR(50),
    hospital_id INT REFERENCES hospitals(id) ON DELETE SET NULL,
    license_number VARCHAR(100),
    availability VARCHAR(100),
    photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Patient Registry Table (Syncs with Firebase Auth)
CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    dob DATE,
    gender VARCHAR(20),
    blood_group VARCHAR(10),
    address TEXT,
    status VARCHAR(50) DEFAULT 'approved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Doctor-Patient Mapping Table (Relational assignments)
CREATE TABLE IF NOT EXISTS doctor_patient_mapping (
    id SERIAL PRIMARY KEY,
    doctor_id VARCHAR(128) REFERENCES doctors(id) ON DELETE CASCADE,
    patient_id VARCHAR(128) REFERENCES patients(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_mapping UNIQUE(doctor_id, patient_id)
);

-- 5. IoT Devices Table
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(128) PRIMARY KEY, -- e.g., Device serial number 'HS-001'
    patient_id VARCHAR(128) REFERENCES patients(id) ON DELETE SET NULL,
    device_type VARCHAR(100) DEFAULT 'ESP32',
    status VARCHAR(50) DEFAULT 'online',
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Historical Telemetry Table (15s intervals)
CREATE TABLE IF NOT EXISTS telemetry_history (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(128) REFERENCES patients(id) ON DELETE CASCADE,
    device_id VARCHAR(128) REFERENCES devices(id) ON DELETE SET NULL,
    heart_rate INT,
    spo2 NUMERIC(5, 2),
    temperature_c NUMERIC(5, 2),
    humidity NUMERIC(5, 2),
    condition VARCHAR(50), -- 'Normal', 'Abnormal', 'Critical'
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for fast analytics queries (trends over time)
CREATE INDEX IF NOT EXISTS idx_telemetry_patient_timestamp ON telemetry_history(patient_id, timestamp DESC);

-- 7. ECG Segments (Relational storage of waveforms)
CREATE TABLE IF NOT EXISTS ecg_segments (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(128) REFERENCES patients(id) ON DELETE CASCADE,
    telemetry_id INT REFERENCES telemetry_history(id) ON DELETE CASCADE,
    waveform_data TEXT, -- Comma-separated floating point values
    status VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Emergency Alerts Table (Permanent Relational Logs)
CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(128) PRIMARY KEY, -- e.g., 'ALERT-timestamp'
    patient_id VARCHAR(128) REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id VARCHAR(128) REFERENCES doctors(id) ON DELETE SET NULL,
    severity VARCHAR(50), -- 'CRITICAL', 'HIGH', 'MODERATE'
    status VARCHAR(100), -- 'PENDING_DOCTOR_VERIFICATION', 'CRITICAL_CONFIRMED', 'SAFE_CONFIRMED', 'AMBULANCE_DISPATCHED', 'RESOLVED'
    heart_rate_at_trigger INT,
    spo2_at_trigger NUMERIC(5, 2),
    temp_at_trigger NUMERIC(5, 2),
    ai_summary TEXT,
    detected_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_patient ON alerts(patient_id);

-- 9. AI Assessment Reports
CREATE TABLE IF NOT EXISTS ai_reports (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(128) REFERENCES patients(id) ON DELETE CASCADE,
    summary TEXT,
    risk_level VARCHAR(50),
    abnormal_parameters TEXT,
    recommendation TEXT,
    confidence VARCHAR(50),
    vitals_snapshot JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_patient ON ai_reports(patient_id);

-- 10. Chat History Table
CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    sender_id VARCHAR(128) NOT NULL,
    receiver_id VARCHAR(128) NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_history_users ON chat_history(sender_id, receiver_id);

-- 11. Patient Medical Profiles (Structured long-term history)
CREATE TABLE IF NOT EXISTS medical_profiles (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(128) REFERENCES patients(id) ON DELETE CASCADE UNIQUE,
    conditions TEXT,
    allergies TEXT,
    medications TEXT,
    emergency_notes TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Emergency Contacts Table
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(128) REFERENCES patients(id) ON DELETE CASCADE,
    contact_type VARCHAR(50), -- 'ambulance', 'family', 'friend'
    name VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Notifications History Table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    type VARCHAR(50), -- 'EMERGENCY', 'ALERT', 'SYSTEM'
    title VARCHAR(255) NOT NULL,
    message TEXT,
    severity VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- 14. Audit System Logs
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(128),
    action VARCHAR(255) NOT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
