import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Heart, 
  Activity, 
  History, 
  MapPin, 
  Bell, 
  Users, 
  LogOut, 
  X, 
  Settings, 
  User,
  MessageSquare,
  Stethoscope,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../../shared/lib/firebase';
import AIChatWidget from './patient/AIChatWidget';

interface PatientSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  patientData?: any;
}

const PatientSidebar: React.FC<PatientSidebarProps> = ({ isSidebarOpen, setIsSidebarOpen, patientData }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, showToast } = useAuth();

  const handleSignOut = async () => {
    if (location.pathname === '/patient/live-location') {
      navigate('/patient/dashboard');
      return;
    }
    try {
      await auth.signOut();
      showToast('Successfully signed out', 'success');
      navigate('/login');
    } catch (error) {
      showToast('Error signing out', 'error');
    }
  };

  const menuItems: any[] = [];

  return (
    <>
      <aside className={`
        fixed lg:relative z-[90] lg:z-10
        w-80 h-full bg-[#0B1120] text-white border-r border-white/5 flex flex-col
        transition-transform duration-500 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
       shadow-2xl lg:shadow-none
      `}>
        {/* Header */}
        <div className="p-8 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
            navigate('/patient/dashboard');
            if (window.innerWidth < 1024) setIsSidebarOpen(false);
          }}>
            <Heart className="w-8 h-8 text-accent-maroon fill-accent-maroon" />
            <span className="text-xl font-bold text-white tracking-tight">
              HeartSync
            </span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-6 pt-2">
          <div 
            onClick={() => {
              navigate('/patient/profile');
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            className="bg-white/5 rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/10 relative flex flex-col justify-between min-h-[150px] cursor-pointer hover:bg-white/10 transition-all active:scale-95 group"
          >
            <div className="flex items-center gap-5">
               {/* Avatar Container */}
               <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/20 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                  {profile?.profileImage || profile?.photoURL || user?.photoURL ? (
                    <img src={profile?.profileImage || profile?.photoURL || user?.photoURL} className="w-full h-full object-cover" alt="Profile" />
                  ) : (
                    <User className="w-6 h-6 text-slate-400" strokeWidth={2} />
                  )}
               </div>
               
               {/* User Info */}
               <div className="flex flex-col min-w-0">
                  <h4 className="text-[17px] font-bold text-white tracking-tight leading-tight mb-1.5 truncate">
                    {profile?.fullName || profile?.displayName || patientData?.patientName || patientData?.fullName || user?.displayName || 'Unknown'}
                  </h4>
                  <p className="text-[11px] font-black text-accent-maroon uppercase tracking-widest">
                    {profile?.serialNumber || patientData?.serialNumber || 'HS-001'}
                  </p>
               </div>
            </div>

            {/* Live Indicator */}
            <div className="flex items-center gap-2.5 mt-6">
              <div className="w-2.5 h-2.5 bg-[#00e676] rounded-full shadow-[0_0_8px_rgba(0,230,118,0.6)] animate-pulse" />
              <span className="text-[11px] font-black text-white uppercase tracking-widest">RTDB LIVE</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-6 space-y-1 overflow-y-auto no-scrollbar">
          <p className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Central Hub</p>
          {menuItems.map((item) => {
            const isActive = item.exact 
              ? location.pathname === item.path 
              : location.pathname.startsWith(item.path);
            
            return (
              <button
                key={item.label}
                onClick={() => {
                  navigate(item.path);
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all group relative
                  ${isActive 
                    ? 'bg-accent-maroon text-white shadow-premium' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'}
                `}
              >
                <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-white/10' : 'bg-white/5 group-hover:bg-white/10'}`}>
                  <item.icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-8 border-t border-white/5">
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-all group"
          >
            <div className="p-2 bg-white/5 rounded-xl group-hover:bg-white/10">
              <LogOut className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold tracking-tight">Sign Out</span>
          </button>
        </div>
      </aside>
      {location.pathname !== '/patient/ai-chat' && (
        <AIChatWidget userId={user?.uid || "sensor-node-001"} />
      )}
    </>
  );
};

export default PatientSidebar;
