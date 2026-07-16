import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import EmergencySiren from './components/EmergencySiren';
import EmergencyMonitor from './components/EmergencyMonitor';
import EmergencyAlertModal from './components/EmergencyAlertModal';

// Lazy load components
const Landing = lazy(() => import('./pages/Landing'));
const CriticalPatients = lazy(() => import('./pages/CriticalPatients'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const RoleSelection = lazy(() => import('./pages/RoleSelection'));
const PatientLogin = lazy(() => import('./pages/PatientLogin'));
const PatientOnboarding = lazy(() => import('./pages/PatientOnboarding'));
const PatientDashboard = lazy(() => import('./pages/PatientDashboard'));
const PatientProfile = lazy(() => import('./pages/PatientProfile'));
const NearbyCare = lazy(() => import('./pages/NearbyCare'));
const AIAssessment = lazy(() => import('./pages/AIAssessment'));
const AIChat = lazy(() => import('./pages/AIChat'));
const LiveLocation = lazy(() => import('./pages/LiveLocation'));
const Consultations = lazy(() => import('./pages/Consultations'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const PendingApproval = lazy(() => import('./pages/PendingApproval'));
const DoctorDashboard = lazy(() => import('./pages/DoctorDashboard'));
const DoctorLogin = lazy(() => import('./pages/DoctorLogin'));
const DoctorOnboarding = lazy(() => import('./pages/DoctorOnboarding'));
const DoctorProfile = lazy(() => import('./pages/DoctorProfile'));
const DoctorPatients = lazy(() => import('./pages/DoctorPatients'));
const DoctorPatientDetails = lazy(() => import('./pages/DoctorPatientDetails'));
const DoctorLiveMonitoring = lazy(() => import('./pages/DoctorLiveMonitoring'));
const DoctorAlerts = lazy(() => import('./pages/DoctorAlerts'));
const DoctorEmergency = lazy(() => import('./pages/DoctorEmergency'));

const LoadingFallback = () => (
  <div className="min-h-screen bg-white flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 border-2 border-slate-100 rounded-full" />
        <div className="absolute inset-0 border-2 border-accent-maroon border-t-transparent rounded-full animate-spin" />
        <Heart className="absolute inset-0 m-auto w-4 h-4 text-accent-maroon animate-pulse" />
      </div>
      <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.3em] animate-pulse">Initializing Portal...</p>
    </div>
  </div>
);

export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <AuthProvider>
          <EmergencySiren />
          <EmergencyAlertModal />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Landing />} />
              
              {/* Auth Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/patient/login" element={<PatientLogin />} />
              <Route path="/doctor/login" element={<DoctorLogin />} />
              <Route path="/select-role" element={<RoleSelection />} />

              {/* Patient Routes */}
              <Route path="/patient/onboarding" element={<ProtectedRoute accessRole="patient"><PatientOnboarding /></ProtectedRoute>} />
              <Route path="/patient/dashboard" element={<ProtectedRoute accessRole="patient"><PatientDashboard /></ProtectedRoute>} />
              <Route path="/patient/profile" element={<ProtectedRoute accessRole="patient"><PatientProfile /></ProtectedRoute>} />
              <Route path="/patient/nearby-care" element={<ProtectedRoute accessRole="patient"><NearbyCare /></ProtectedRoute>} />
              <Route path="/patient/ai-assessment" element={<ProtectedRoute accessRole="patient"><AIAssessment /></ProtectedRoute>} />
              <Route path="/patient/ai-chat" element={<ProtectedRoute accessRole="patient"><AIChat /></ProtectedRoute>} />
              <Route path="/patient/live-location" element={<ProtectedRoute accessRole="patient"><LiveLocation /></ProtectedRoute>} />
              <Route path="/patient/consultations" element={<ProtectedRoute accessRole="patient"><Consultations /></ProtectedRoute>} />
              <Route path="/patient/notifications" element={<ProtectedRoute accessRole="patient"><Notifications /></ProtectedRoute>} />

              {/* Doctor Routes */}
              <Route path="/doctor/dashboard" element={<ProtectedRoute accessRole="doctor"><DoctorDashboard /></ProtectedRoute>} />
              <Route path="/doctor/registration" element={<ProtectedRoute accessRole="doctor"><DoctorOnboarding /></ProtectedRoute>} />
              <Route path="/doctor/profile" element={<ProtectedRoute accessRole="doctor"><DoctorProfile /></ProtectedRoute>} />
              <Route path="/doctor/patients" element={<ProtectedRoute accessRole="doctor"><DoctorPatients /></ProtectedRoute>} />
               <Route path="/doctor/critical-patients" element={<ProtectedRoute accessRole="doctor"><CriticalPatients /></ProtectedRoute>} />
              <Route path="/doctor/patient/:id" element={<ProtectedRoute accessRole="doctor"><DoctorPatientDetails /></ProtectedRoute>} />
              <Route path="/doctor/report/:id" element={<ProtectedRoute accessRole="doctor"><DoctorPatientDetails /></ProtectedRoute>} />
              <Route path="/doctor/live-monitoring" element={<ProtectedRoute accessRole="doctor"><DoctorLiveMonitoring /></ProtectedRoute>} />
              <Route path="/doctor/alerts" element={<ProtectedRoute accessRole="doctor"><DoctorAlerts /></ProtectedRoute>} />
              <Route path="/doctor/emergency" element={<ProtectedRoute accessRole="doctor"><DoctorEmergency /></ProtectedRoute>} />

              {/* Admin Routes */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<ProtectedRoute accessRole="admin"><AdminDashboard /></ProtectedRoute>} />

              <Route path="/pending-approval" element={<ProtectedRoute><PendingApproval /></ProtectedRoute>} />

              <Route path="/doctor-dashboard" element={<Navigate to="/doctor/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/" />} />

            </Routes>
          </Suspense>
        </AuthProvider>
      </ErrorBoundary>
    </Router>
  );
}

