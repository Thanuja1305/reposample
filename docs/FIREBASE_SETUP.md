# Firebase Setup Guide

Follow this guide to configure and initialize Firebase services for the HeartSync system.

## Step 1: Create a Firebase Project
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project** and name it `HeartSync`.
3. Enable Google Analytics (optional).

## Step 2: Set Up Databases
### Realtime Database (RTDB)
1. Go to **Realtime Database** under the Build menu.
2. Click **Create Database** and select your regional location (e.g. `asia-southeast1`).
3. Set the rules to test mode (or configure custom rules for production).

### Cloud Firestore
1. Go to **Firestore Database**.
2. Click **Create Database** and start in production/test mode.

## Step 3: Generate Service Account Credentials
1. Navigate to **Project Settings** > **Service Accounts**.
2. Click **Generate New Private Key**.
3. Download the JSON key file.
4. Extract the keys (`projectId`, `clientEmail`, and `privateKey`) and set them in the server's `.env` environment configuration.
