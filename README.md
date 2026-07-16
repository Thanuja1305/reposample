# ❤️ HeartSync

## AI-Powered IoT Cardiac Monitoring & Emergency Response System

<div align="center">

<img width="1200" alt="HeartSync Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

### **Continuous Monitoring • Intelligent Analysis • Faster Emergency Response**

**"Every heartbeat matters. HeartSync ensures that no critical heartbeat goes unnoticed."**

</div>

---

# 📖 About HeartSync

HeartSync is an AI-powered IoT healthcare platform designed to provide continuous cardiac monitoring, intelligent health analysis, and rapid emergency response.

The system continuously monitors a patient's physiological parameters using IoT sensors, securely processes the collected data through a cloud-based backend, stores both live and historical records, generates AI-assisted medical insights, and immediately alerts doctors and emergency contacts whenever a potentially critical cardiac event is detected.

HeartSync aims to reduce response time during medical emergencies while enabling doctors to remotely monitor patients through a secure, intelligent, and scalable healthcare platform.

---

# 🚀 Key Features

## 🫀 Real-Time Health Monitoring

* Live Heart Rate Monitoring
* Blood Oxygen Saturation (SpO₂)
* ECG Signal Monitoring
* Temperature Monitoring
* Humidity Monitoring
* Device Connection Status
* Sensor Status Validation
* Signal Quality Monitoring
* Continuous Telemetry Processing

---

## 🤖 AI Health Assistant

* AI-powered Health Assistant
* Intelligent Health Reports
* Patient-friendly Medical Summaries
* Risk Level Analysis
* Personalized Health Recommendations
* AI Chat Support
* Medical Report History

---

## 👤 Patient Dashboard

The patient dashboard provides:

* Live Heart Rate
* Live SpO₂
* Live ECG Visualization
* Temperature Monitoring
* Device Status
* AI Health Reports
* Emergency Status
* Medical History
* Nearby Hospitals
* Nearby Doctors
* Emergency Contact Management
* Health Notifications

---

## 👨‍⚕️ Doctor Dashboard

The doctor dashboard enables healthcare professionals to:

* Monitor assigned patients
* View live patient vitals
* Analyze ECG waveforms
* Review AI-generated health reports
* Track emergency alerts
* Access patient history
* Confirm emergencies
* Initiate emergency workflow

---

## 🚨 Emergency Response System

When an abnormal cardiac condition is detected, HeartSync automatically:

* Detects the abnormal condition
* Alerts the assigned doctor
* Sends WhatsApp notifications through Twilio
* Shares the patient's live location
* Identifies nearby hospitals
* Assists emergency responders with navigation
* Stores emergency logs for future review

---

# 🏗️ System Architecture

```text
                     ESP32
                       │
                       ▼
             Node.js + Express Backend
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
Firebase Realtime Database      PostgreSQL
 (Live Monitoring)        (Historical Records)
         │                           │
         └─────────────┬─────────────┘
                       ▼
          React + TypeScript Application
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   Patient Dashboard        Doctor Dashboard
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
 Google Gemini AI              Twilio APIs
                               Google Maps API
```

---

# ⚙️ Technology Stack

## Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* React Router
* Chart.js / ECG Visualization

---

## Backend

* Node.js
* Express.js

---

## Database

### Firebase

* Firebase Authentication
* Firebase Realtime Database

Used for:

* Live Sensor Readings
* Device Status
* Emergency Status
* Live Notifications
* Current AI Summary

---

### PostgreSQL

Used for:

* Patient Records
* Doctor Records
* Historical Telemetry
* Medical Reports
* Emergency Logs
* AI Reports
* Analytics
* Audit Logs

---

## Artificial Intelligence

* Google Gemini AI

Used for:

* Medical Report Generation
* Health Risk Assessment
* Patient-Friendly Explanations
* AI Chat Assistant

---

## APIs

* Twilio WhatsApp API
* Twilio Voice API
* Google Maps API
* RapidAPI

---

## IoT Hardware

* ESP32
* AD8232 ECG Sensor
* MAX30102 Pulse Oximeter
* DHT11 / DHT22 Temperature & Humidity Sensor

---

# 📂 Project Structure

```text
HeartSync/

├── frontend/
│
│   ├── components/
│   ├── pages/
│   ├── layouts/
│   ├── contexts/
│   ├── services/
│   ├── hooks/
│   ├── utils/
│   └── assets/
│
├── backend/
│
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── database/
│   ├── firebase/
│   ├── ai/
│   └── twilio/
│
├── firmware/
│
│   └── ESP32/
│
├── database/
│
│   ├── firebase/
│   └── postgresql/
│
├── public/
│
├── .env.local
│
└── README.md
```

---

# 🔄 Data Flow

```text
ESP32 Sensors

↓

Node.js + Express Backend

↓

Sensor Validation

↓

AI Processing

↓

Emergency Detection

↓

Firebase Realtime Database

↓

Patient Dashboard

Doctor Dashboard

↓

Historical Data Storage

↓

PostgreSQL

↓

Medical Reports

Analytics

Historical Trends
```

---

# 🔥 Firebase Responsibilities

Firebase Realtime Database powers all live operations.

It stores:

* Current Heart Rate
* Current SpO₂
* Current ECG Segment
* Temperature
* Humidity
* Device Status
* Sensor Status
* Live Emergency State
* Notifications
* Latest AI Summary

Firebase Authentication manages secure login for patients and doctors.

---

# 🐘 PostgreSQL Responsibilities

PostgreSQL stores structured long-term information including:

* Patient Profiles
* Doctor Profiles
* Historical Telemetry
* ECG History
* Medical Reports
* AI Reports
* Emergency Logs
* Notification History
* Chat History
* Analytics
* Audit Logs

---

# 🫀 Emergency Workflow

```text
ESP32 Detects Abnormal Reading

↓

Backend Validation

↓

AI Risk Analysis

↓

Emergency Alert Generated

↓

Doctor Notification

↓

Doctor Confirmation

↓

Twilio WhatsApp Notification

↓

Emergency Contacts

↓

Live GPS Location Shared

↓

Nearby Hospital Information

↓

Emergency Response
```

---

# 🔒 Security Features

* Firebase Authentication
* Protected API Routes
* Role-Based Access Control
* Secure Patient Data
* Sensor Data Validation
* Device Status Verification
* Emergency Logging
* AI Report History

---

# 📊 Current Features

* ✅ Real-Time Heart Rate Monitoring
* ✅ SpO₂ Monitoring
* ✅ ECG Visualization
* ✅ Temperature Monitoring
* ✅ Humidity Monitoring
* ✅ Device Connectivity Status
* ✅ AI Health Assistant
* ✅ AI Medical Reports
* ✅ Patient Dashboard
* ✅ Doctor Dashboard
* ✅ Emergency Alert System
* ✅ WhatsApp Notifications
* ✅ Google Maps Integration
* ✅ Nearby Hospital Finder
* ✅ Historical Medical Reports

---

# 💻 Installation

## Prerequisites

* Node.js (v18 or later)
* npm
* Firebase Project
* PostgreSQL Database
* Google Gemini API Key
* Twilio Account
* Google Maps API Key

---

## Clone the Repository

```bash
git clone https://github.com/your-username/HeartSync.git

cd HeartSync
```

---

## Install Dependencies

```bash
npm install
```

---

## Configure Environment Variables

Create a `.env.local` file and add:

```env
GEMINI_API_KEY=

FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_DATABASE_URL=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=

DATABASE_URL=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

GOOGLE_MAPS_API_KEY=
```

---

## Start the Development Server

```bash
npm run dev
```

---

# 🌍 Vision

HeartSync is designed to transform healthcare from a reactive system into a proactive, intelligent, and connected ecosystem.

By combining IoT, Artificial Intelligence, cloud technologies, and real-time emergency communication, HeartSync empowers patients with continuous monitoring, enables doctors to make informed decisions through AI-assisted insights, and helps emergency responders act faster during critical situations.

---

# 👥 Team

## **Go-Getters**

**Project:** HeartSync

**Domain:** AI + IoT Healthcare

---

# 📄 License

This project is developed for educational, research, and hackathon purposes.

---

<div align="center">

## ❤️ HeartSync

### **AI-Powered IoT Cardiac Monitoring & Emergency Response System**

*"Connecting Patients, Doctors, and Emergency Services through Intelligent Healthcare."*

</div>
