# Troubleshooting Guide

This document lists common system errors, their root causes, and resolutions.

## 1. Firebase Permission Denied
* **Symptom:** UI displays blank screens or the terminal logs `permission-denied` errors.
* **Resolution:** Ensure that the Firestore rules (`firestore.rules`) allow authenticated read/write operations for matching UIDs, and that your database rules are correctly configured to let the Firebase Admin SDK write to the endpoints.

## 2. Empty Patient Registry
* **Symptom:** The Doctor Dashboard Patient Registry page is empty even though emergency alerts have been triggered.
* **Resolution:** Verify that the patient records are correctly registered in the Firestore `users` collection with `role: 'patient'` and `status: 'approved'`. Logging into the application ensures that the default simulation patient node (`m1uph2bX7SVd9Wbyge1AMqAmq093`) is automatically initialized and linked to the registries.

## 3. Web Audio Siren Mute Issues
* **Symptom:** Siren alarms fail to play automatically when critical notifications are received.
* **Resolution:** Modern browsers block audio playback until a user interacts with the page. Click anywhere on the Doctor Dashboard to trigger interaction permissions and initialize audio contexts.
