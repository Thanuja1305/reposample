import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode; accessRole?: 'patient' | 'doctor' | 'admin' }> = ({ children, accessRole }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const path = location.pathname;

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-2 border-slate-100 rounded-full" />
            <div className="absolute inset-0 border-2 border-accent-maroon border-t-transparent rounded-full animate-spin" />
            <Heart className="absolute inset-0 m-auto w-4 h-4 text-accent-maroon animate-pulse" />
          </div>
          <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.3em] animate-pulse">Syncing Portal...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // If accessing a doctor route, redirect to doctor login, otherwise patient login
    const isDoctorRoute = path.startsWith('/doctor');
    return <Navigate to={isDoctorRoute ? "/doctor/login" : "/patient/login"} state={{ from: location }} replace />;
  }

  // If user is authenticated but profile is not loaded or null, redirect to role selection
  if (!profile) {
    if (path !== '/select-role') {
      return <Navigate to="/select-role" replace />;
    }
    return <>{children}</>;
  }

  if (!profile.role) {
    if (path !== '/select-role') {
      return <Navigate to="/select-role" replace />;
    }
    return <>{children}</>;
  }

  // Handle account approval for doctors
  if (profile.role === 'doctor' && profile.status === 'pending') {
    if (path !== '/pending-approval') {
      return <Navigate to="/pending-approval" replace />;
    }
    return <>{children}</>;
  }

  if (accessRole && profile.role !== accessRole) {
    // If role doesn't match, redirect to their respective dashboard
    if (profile.role === 'doctor') return <Navigate to="/doctor/live-monitoring" replace />;
    if (profile.role === 'patient') return <Navigate to="/patient/dashboard" replace />;
    return <Navigate to="/select-role" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
