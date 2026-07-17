# Deployment Guide

Follow this guide to deploy the HeartSync application frontend to Vercel and backend services to Render.

## Frontend Deployment (Vercel)
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the root workspace directory.
3. Configure the environment variables matching the public Firebase options:
   * `VITE_FIREBASE_API_KEY`
   * `VITE_FIREBASE_DATABASE_URL`
   * `VITE_FIREBASE_PROJECT_ID`
4. Build parameters:
   * **Build Command:** `npm run build`
   * **Output Directory:** `dist`

## Backend Deployment (Render)
1. Create a Web Service linked to the repository.
2. Build parameters:
   * **Build Command:** `npm run build` or `npm install`
   * **Start Command:** `npm start`
3. Configure all secret values in the Render Environment Variables tab (e.g. `FIREBASE_PRIVATE_KEY`, `TWILIO_AUTH_TOKEN`, `GEMINI_API_KEY`).
