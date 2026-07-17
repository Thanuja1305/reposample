/**
 * Shared API base URL utility.
 * 
 * In production (Vercel), reads from VITE_API_URL environment variable.
 * Falls back to http://localhost:5000 for local development.
 */
export const API_BASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL)
  ? (import.meta as any).env.VITE_API_URL as string
  : 'http://localhost:5000';
