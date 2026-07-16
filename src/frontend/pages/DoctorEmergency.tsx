import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Navigation, 
  ShieldAlert, 
  MapPin, 
  Clock, 
  Phone, 
  ArrowRight,
  Activity,
  HeartPulse,
  Search,
  Filter,
  CheckCircle2,
  Ambulance,
  AlertCircle,
  Trash2,
  Menu
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot, limit, addDoc, serverTimestamp, updateDoc, doc, getDocs, deleteDoc } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { db, rtdb } from '../../shared/lib/firebase';
import DoctorSidebar from '../components/DoctorSidebar';
import GoogleMapsTracker from '../components/GoogleMapsTracker';
import { sendRealtimeWhatsAppEmergency } from '../../backend/services/emergencyService';

const DoctorEmergency = () => {
  const navigate = useNavigate();
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'ambulanceDispatch'),
      orderBy('dispatchedAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDispatches(docs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const activeDispatches = dispatches.filter(d => d.status !== 'COMPLETED');
  const completedDispatches = dispatches.filter(d => d.status === 'COMPLETED');
  const displayArchives = completedDispatches;

  const handleManualDispatch = async () => {
    try {
      const patientId = 'HS-001';

      // Multi-path priority lookup — same strategy as the live dashboards
      const vitalsPaths = [
        `liveHealthMetrics/${patientId}`,
        `liveHealthMetrics/HS-001`,
        `patients/${patientId}/liveVitals`,
        `users/${patientId}/liveReading`,
        `users/HS-001/liveReading`,
        `users/m1uph2bX7SVd9Wbyge1AMqAmq093/liveReading`,
        `users/onYK6WJGu6VR6fEgQXBhximLEFI3/liveReading`,
      ];

      const locationPaths = [
        `liveHealthMetrics/${patientId}/location`,
        `liveHealthMetrics/HS-001/location`,
        `patients/${patientId}/location`,
        `users/${patientId}/liveReading/location`,
      ];

      // RTDB profile paths as fallback
      const rtdbProfilePaths = [
        `patients/${patientId}/profile`,
        `liveHealthMetrics/${patientId}/profile`,
        `liveHealthMetrics/HS-001/profile`,
        `users/${patientId}/profile`,
        `users/HS-001/profile`,
      ];

      // Fetch RTDB vitals, location, and profile concurrently
      // ALSO fetch Firestore users collection by serialNumber — this is the source of truth for name/age
      const [vitalsSnaps, locationSnaps, rtdbProfileSnaps, firestoreSnap] = await Promise.all([
        Promise.all(vitalsPaths.map(p => get(ref(rtdb, p)))),
        Promise.all(locationPaths.map(p => get(ref(rtdb, p)))),
        Promise.all(rtdbProfilePaths.map(p => get(ref(rtdb, p)))),
        getDocs(query(collection(db, 'users'),
          where('role', '==', 'patient'))),
      ]);

      // Pick first vitals path with real sensor data
      let vitalsData: any = {};
      for (const snap of vitalsSnaps) {
        if (snap.exists()) {
          const val = snap.val();
          const bpm = Number(val?.heartRate || val?.bpm || val?.BPM || val?.HeartRate || 0);
          const spo2 = Number(val?.spo2 || val?.SpO2 || val?.SPO2 || val?.oxygen || 0);
          if (bpm > 0 || spo2 > 0 || val?.temperature || val?.temperature_c || val?.humidity) {
            vitalsData = val;
            break;
          }
        }
      }

      // Pick first location path with data
      let locationData: any = null;
      for (const snap of locationSnaps) {
        if (snap.exists()) {
          locationData = snap.val();
          break;
        }
      }

      // --- Resolve patient name & age ---
      // Priority 1: Firestore users collection — use the SAME selectedPatientId logic as Live Telemetry
      let firestoreProfile: any = null;
      if (!firestoreSnap.empty) {
        const patients = firestoreSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Use selectedPatientId from localStorage — this is exactly what Live Telemetry uses
        const savedId = localStorage.getItem('selectedPatientId');

        // Try matches in order of reliability
        const matched =
          // 1. Exact match on savedId (the patient the doctor was monitoring)
          (savedId && patients.find((p: any) => p.uid === savedId || p.id === savedId || p.serialNumber === savedId)) ||
          // 2. serialNumber field on the patient doc === patientId (HS-001)
          patients.find((p: any) =>
            p.serialNumber === patientId ||
            p.profile?.serialNumber === patientId
          ) ||
          // 3. First patient with a real name (skip "Demo Patient" style entries)
          patients.find((p: any) => {
            const name = p.profile?.fullName || p.profile?.name || p.fullName || p.name || '';
            return p.onboardingCompleted === true && name && name.toLowerCase() !== 'demo patient';
          }) ||
          // 4. Any onboarded patient
          patients.find((p: any) => p.onboardingCompleted === true) ||
          // 5. Last resort: any patient with a name
          patients.find((p: any) => p.profile?.fullName || p.profile?.name || p.fullName || p.name);

        if (matched) firestoreProfile = matched;
      }

      // Priority 2: RTDB profile paths
      let rtdbProfileData: any = null;
      for (const snap of rtdbProfileSnaps) {
        if (snap.exists()) {
          const p = snap.val();
          if (p?.fullName || p?.name || p?.displayName) {
            rtdbProfileData = p;
            break;
          }
        }
      }

      // Normalize vitals field names
      const bpm      = Number(vitalsData?.heartRate || vitalsData?.bpm || vitalsData?.BPM || vitalsData?.HeartRate || 0);
      const spo2     = Number(vitalsData?.spo2 || vitalsData?.SpO2 || vitalsData?.SPO2 || vitalsData?.oxygen || 0);
      const tempC    = Number(vitalsData?.temperature_c || vitalsData?.Temperature_C || vitalsData?.temperature || vitalsData?.temp || vitalsData?.Temp || 0);
      const humidity = Number(vitalsData?.humidity || vitalsData?.Humidity || vitalsData?.hum || vitalsData?.Hum || 0);

      // Resolve name: Firestore > RTDB profile > vitals node
      const patientName =
        firestoreProfile?.profile?.fullName || firestoreProfile?.profile?.name ||
        firestoreProfile?.fullName || firestoreProfile?.name || firestoreProfile?.displayName ||
        rtdbProfileData?.fullName || rtdbProfileData?.name || rtdbProfileData?.displayName ||
        vitalsData?.patientName || 'Active Patient';

      // Resolve age: Firestore > RTDB profile > vitals node
      const patientAge =
        firestoreProfile?.profile?.age || firestoreProfile?.profile?.dob ||
        firestoreProfile?.age || firestoreProfile?.dob ||
        rtdbProfileData?.age || rtdbProfileData?.dob ||
        vitalsData?.patientAge || '--';

      sendRealtimeWhatsAppEmergency({
        bpm,
        spo2,
        temperature_c: tempC,
        humidity,
        patientName,
        patientAge,
        serialNumber: patientId,
        condition:    'Critical',
        timestamp:    vitalsData?.timestamp || Date.now(),
      }, locationData);
    } catch (err) {
      console.error('Failed to trigger manual dispatch:', err);
    }
  };

  const handleDeleteDispatch = async (dispatchId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this dispatch record permanently?')) return;
    try {
      await deleteDoc(doc(db, 'ambulanceDispatch', dispatchId));
    } catch (err) {
      console.error('Failed to delete dispatch:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      <title>Emergency Dispatch | HeartSync</title>
      
      {/* MOBILE OVERLAY */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] lg:hidden"
          />
        )}
      </AnimatePresence>

      <DoctorSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-20 md:h-24 bg-white border-b border-slate-200 px-6 md:px-12 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
             <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-accent-maroon transition-all">
                <Menu className="w-6 h-6" />
             </button>
             <div>
               <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter italic">Emergency Dispatch</h2>
               <p className="hidden md:block text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Institutional First Response Portal</p>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
             <button 
                onClick={handleManualDispatch}
                className="px-4 md:px-6 py-2.5 md:py-3 bg-accent-maroon text-white rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest shadow-xl shadow-accent-maroon/20 flex items-center gap-2 md:gap-3 hover:scale-105 active:scale-95 transition-all"
             >
                <PlusIcon className="w-3 md:w-4 h-3 md:h-4 shrink-0" />
                <span className="hidden sm:inline">Manual Dispatch Trigger</span>
                <span className="sm:hidden">Trigger</span>
             </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-12 no-scrollbar">
           <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-10">
              
              {/* LEFT & CENTER: Active Dispatches */}
              <div className="lg:col-span-2 space-y-8 md:space-y-10">
                 <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                       <Ambulance className="w-5 h-5 text-accent-maroon" />
                       <h3 className="text-xs md:text-sm font-black text-slate-900 uppercase tracking-[0.15em] md:tracking-[0.2em]">Active Deployments</h3>
                    </div>
                    <span className="px-3 md:px-4 py-1.5 md:py-2 bg-accent-maroon/10 text-accent-maroon text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl whitespace-nowrap">
                       {activeDispatches.length} Units En Route
                    </span>
                 </div>

                 <div className="space-y-6">
                    {loading ? (
                      <div className="py-16 md:py-20 text-center bg-white rounded-[32px] md:rounded-[40px] border border-slate-100 animate-pulse">
                         <div className="w-10 h-10 bg-slate-100 rounded-full mx-auto mb-4" />
                         <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Scanning Dispatch Nodes...</p>
                      </div>
                    ) : activeDispatches.length > 0 ? activeDispatches.map((dispatch) => (
                      <div key={dispatch.id} className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-100 shadow-premium p-6 md:p-10 relative overflow-hidden group">
                         <div className="absolute top-0 right-0 p-6 md:p-8 pointer-events-none">
                            <Navigation className="w-8 h-8 md:w-10 md:h-10 text-slate-50 group-hover:text-accent-maroon/10 transition-colors duration-500" />
                         </div>
                         
                         <div className="absolute top-6 right-6 md:top-8 md:right-8 z-30">
                            <button
                              onClick={() => handleDeleteDispatch(dispatch.id)}
                              title="Delete dispatch record"
                              className="p-2.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95 shadow-md flex items-center justify-center border border-red-100"
                            >
                               <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                            </button>
                         </div>
                         
                         <div className="flex flex-col xl:flex-row gap-8 md:gap-10 relative z-10">
                            <div className="flex-1 space-y-6 md:space-y-8">
                               <div className="flex items-center gap-4 md:gap-6">
                                  <div className="w-12 h-12 md:w-16 md:h-16 bg-slate-900 rounded-2xl md:rounded-3xl flex items-center justify-center text-white text-lg md:text-2xl font-black shrink-0">
                                     {dispatch.ambulanceId?.charAt(0) || 'A'}
                                  </div>
                                  <div className="min-w-0">
                                     <h4 className="text-lg md:text-xl font-black text-slate-900 italic tracking-tighter mb-1 truncate">Unit {dispatch.ambulanceId || 'Alpha-1'}</h4>
                                     <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-accent-maroon rounded-full animate-pulse shrink-0" />
                                        <span className="text-[9px] md:text-[10px] font-black text-accent-maroon uppercase tracking-widest truncate">{dispatch.status?.replace('_', ' ')}</span>
                                     </div>
                                  </div>
                               </div>

                               <div className="grid grid-cols-2 gap-4 md:gap-8">
                                  <div className="min-w-0">
                                     <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">Primary Patient</p>
                                     <p className="text-xs md:text-sm font-bold text-slate-900 tracking-tight truncate">{dispatch.patientName || 'Emergency Node'}</p>
                                  </div>
                                  <div className="min-w-0">
                                     <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">Impact Level</p>
                                     <p className="text-xs md:text-sm font-bold text-accent-maroon tracking-tight truncate">Level 1 - Critical</p>
                                  </div>
                                  <div className="min-w-0">
                                     <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">Destination</p>
                                     <p className="text-xs md:text-sm font-bold text-slate-900 tracking-tight truncate">{dispatch.hospitalAssigned || 'Institutional Node'}</p>
                                  </div>
                                  <div className="min-w-0">
                                     <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">ETA</p>
                                     <p className="text-xs md:text-sm font-bold text-slate-900 tracking-tight truncate">{dispatch.eta || 'Calculating...'}</p>
                                  </div>
                               </div>
                            </div>
                            
                            <div className="flex flex-row xl:flex-col gap-3 md:gap-4 shrink-0">
                               <button 
                                 onClick={() => navigate(`/doctor/patient/${dispatch.patientId}`)}
                                 className="flex-1 xl:w-48 py-3 md:py-4 bg-slate-50 text-slate-900 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest border border-slate-100 hover:bg-slate-100 transition-all flex items-center justify-center gap-2 md:gap-3"
                               >
                                  <Activity className="w-3 md:w-4 h-3 md:h-4 text-accent-maroon" />
                                  Link
                               </button>
                               <button className="flex-1 xl:w-48 py-3 md:py-4 bg-slate-900 text-white rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2 md:gap-3">
                                  <Navigation className="w-3 md:w-4 h-3 md:h-4 text-medical-red" />
                                  Trace
                               </button>
                            </div>
                         </div>

                         <div className="mt-8 md:mt-10 pt-6 md:pt-8 border-t border-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-3 md:gap-4">
                               <div className="flex -space-x-2">
                                  {[1,2,3].map(i => (
                                    <div key={i} className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[7px] md:text-[8px] font-bold text-slate-400">R</div>
                                  ))}
                               </div>
                               <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest italic truncate hidden sm:inline">Responder Grid Assigned</span>
                               <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest italic sm:hidden">Responders</span>
                            </div>
                             <div className="flex items-center gap-3">
                               <span className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase tracking-widest italic whitespace-nowrap">Sync: 1.2s</span>
                             </div>
                          </div>
                      </div>
                    )) : (
                      <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-100 shadow-premium p-6 md:p-8">
                         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
                            <div className="flex items-center gap-3">
                               <MapPin className="w-5 md:w-6 h-5 md:h-6 text-accent-maroon" />
                               <div>
                                 <h3 className="text-lg md:text-xl font-black text-slate-900 italic tracking-tighter">Live Responder Grid</h3>
                                 <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Standby Operations Mode</p>
                               </div>
                            </div>
                            <span className="px-3 md:px-4 py-1.5 md:py-2 bg-green-50 text-green-600 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl whitespace-nowrap border border-green-100">
                               Grid Online
                            </span>
                         </div>
                         <div className="h-[300px] md:h-[450px] rounded-[24px] md:rounded-[32px] overflow-hidden relative border-4 border-slate-50 shadow-inner group">
                             <GoogleMapsTracker />
                             
                             {/* High-tech overlay for realism */}
                             <div className="absolute inset-0 pointer-events-none rounded-[20px] md:rounded-[28px] border-4 border-slate-900/5 mix-blend-overlay transition-colors group-hover:border-accent-maroon/10" />
                             
                             <div className="absolute top-4 md:top-6 left-4 md:left-6 bg-white/95 backdrop-blur-md px-3 md:px-4 py-2 md:py-3 rounded-xl shadow-2xl border border-slate-100 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-600">
                                <div className="flex items-center gap-2 md:gap-3">
                                   <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                                   Tracking 12 Active Units
                                </div>
                             </div>

                             <div className="absolute bottom-4 md:bottom-6 right-4 md:right-6 bg-slate-900/95 backdrop-blur-md px-3 md:px-4 py-2 md:py-3 rounded-xl shadow-2xl border border-white/10 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white">
                                <div className="flex items-center gap-2">
                                   <Activity className="w-3 h-3 text-accent-maroon" />
                                   Sync Latency: 12ms
                                </div>
                             </div>
                         </div>
                      </div>
                    )}
                 </div>
              </div>

              {/* RIGHT: Stats & History */}
              <div className="space-y-8 md:space-y-10">
                 <div className="bg-slate-900 rounded-[32px] md:rounded-[40px] p-6 md:p-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                       <Activity className="w-24 md:w-32 h-24 md:h-32 text-accent-maroon" />
                    </div>
                    <div className="relative z-10">
                       <h3 className="text-[9px] md:text-[10px] font-black text-accent-maroon uppercase tracking-widest mb-6 italic">Grid Intelligence</h3>
                       <div className="space-y-4 md:space-y-6">
                          <GridStat label="Avg Response" value="4m 20s" />
                          <GridStat label="Hospital Bed Cap" value="84%" />
                          <GridStat label="Active Paramedics" value="12" />
                       </div>
                    </div>
                 </div>

                 <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-100 shadow-premium p-6 md:p-8 overflow-hidden h-full">
                     <h3 className="text-xl font-black text-slate-900 tracking-tighter italic mb-6 md:mb-8">Recent Archives</h3>
                     <div className="space-y-5 md:space-y-6">
                        {displayArchives.length > 0 ? displayArchives.slice(0, 5).map(d => (
                          <div key={d.id} className="flex items-center justify-between group cursor-pointer" onClick={() => d.patientId && navigate(`/doctor/patient/${d.patientId}`)}>
                             <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                <div className="p-2.5 md:p-3 bg-slate-50 text-slate-300 rounded-xl group-hover:bg-slate-900 group-hover:text-white transition-all shrink-0">
                                   <MapPin className="w-4 h-4" />
                                 </div>
                                 <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-900 tracking-tight italic truncate">{d.patientName || 'Completed Action'}</p>
                                    <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">{d.dispatchedAt ? new Date(d.dispatchedAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
                                 </div>
                             </div>
                             <div className="flex items-center gap-2 shrink-0">
                                <CheckCircle2 className="w-4 h-4 text-green-500 group-hover:hidden transition-all" />
                                <button
                                  onClick={(e) => handleDeleteDispatch(d.id, e)}
                                  title="Delete archive record"
                                  className="hidden group-hover:flex p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95 border border-red-100"
                                >
                                   <Trash2 className="w-3.5 h-3.5" />
                                </button>
                             </div>
                          </div>
                        )) : (
                          <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest text-center py-4">No recent archives</p>
                        )}
                     </div>
                 </div>
              </div>

           </div>
        </div>
      </main>
    </div>
  );
};

const GridStat = ({ label, value }: any) => (
  <div className="flex justify-between items-center">
     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
     <span className="text-xl font-black italic">{value}</span>
  </div>
);

const PlusIcon = (props: any) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default DoctorEmergency;
