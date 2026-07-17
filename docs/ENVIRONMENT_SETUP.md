# Environment Setup

This document lists the required environment configuration variables for running HeartSync.

## Server Environment Variables (`backend/.env`)

| Variable Name | Description | Where to Obtain / Value |
| --- | --- | --- |
| `PORT` | Local server port | Defaults to `5000` |
| `FIREBASE_PROJECT_ID` | Firebase ID | Firebase Console > Project Settings |
| `FIREBASE_CLIENT_EMAIL`| Service Account client email | Firebase Console > Service Accounts |
| `FIREBASE_PRIVATE_KEY` | Service Account private key | Firebase Console > Service Accounts |
| `FIREBASE_DATABASE_URL`| Realtime Database endpoint url | Firebase Console > Realtime Database |
| `GEMINI_API_KEY` | API Key for Gemini models | Google AI Studio |
| `TWILIO_ACCOUNT_SID` | Account SID for Twilio | Twilio Console Dashboard |
| `TWILIO_AUTH_TOKEN` | Auth Token for Twilio | Twilio Console Dashboard |
| `TWILIO_PHONE_NUMBER` | Twilio purchased number | Twilio Console Dashboard |
| `TWILIO_WHATSAPP_NUMBER`| Twilio WhatsApp Sandbox number | Twilio Messaging Sandbox |

---

## Frontend Environment Variables (`.env` or `.env.local`)

| Variable Name | Description | Value |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Public Firebase API Key | Firebase Console > Project Settings |
| `VITE_FIREBASE_AUTH_DOMAIN`| Auth Domain | Firebase Console > Project Settings |
| `VITE_FIREBASE_DATABASE_URL`| RTDB URL | Firebase Console > Project Settings |
| `VITE_FIREBASE_PROJECT_ID`| Project ID | Firebase Console > Project Settings |
| `VITE_FIREBASE_STORAGE_BUCKET`| Storage Bucket | Firebase Console > Project Settings |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`| Messaging Sender ID | Firebase Console > Project Settings |
| `VITE_FIREBASE_APP_ID` | App ID | Firebase Console > Project Settings |
