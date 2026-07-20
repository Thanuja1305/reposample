import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Search, 
  Filter, 
  ChevronRight, 
  User,
  Activity,
  Heart,
  Clock,
  ArrowUpRight,
  Menu,
  Trash2
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, rtdb } from '../../shared/lib/firebase';
import DoctorSidebar from '../components/DoctorSidebar';
import { TriangleAlert } from 'lucide-react';
import { emergencyService } from '../../backend/services/emergencyService';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const checkIsCritical = (v: any) => {
  if (!v) return false;
  if (v?.condition === 'Critical' || v?.emergency === true || String(v?.emergency) === 'true') return true;

  const bpm = Number(v.heartRate ?? v.bpm ?? 0);
  const isBpmCritical = bpm < 20 || bpm > 170;

  const spo2 = Number(v.spo2 ?? 0);
  const isSpo2Critical = spo2 < 75;

  const temp = Number(v.temperature_c ?? v.temperature ?? 0);
  const isTempCritical = temp > 0 && (temp < 34 || temp > 40);

  const hum = Number(v.humidity ?? 0);
  const isHumCritical = hum > 0 && (hum < 20 || hum > 75);

  if (isBpmCritical || isSpo2Critical || isTempCritical || isHumCritical) return true;

  const isBpmAbnormal = bpm > 0 && (bpm < 60 || bpm > 100);
  const isSpo2Abnormal = spo2 > 0 && (spo2 < 95);
  const isTempAbnormal = temp > 0 && (temp < 36.1 || temp > 37.2);
  const isHumAbnormal = hum > 0 && (hum < 30 || hum > 60);

  const abnormalCount = [isBpmAbnormal, isSpo2Abnormal, isTempAbnormal, isHumAbnormal].filter(Boolean).length;
  return abnormalCount >= 3;
};

const DoctorPatients = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'high_risk' | 'active'>('high_risk');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [vitalsMap, setVitalsMap] = useState<Record<string, any>>({});

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'patient'),
      where('status', '==', 'approved')
    );

    // Real-time listener for patients registry
    const unsubPatients = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(docs);
      setLoading(false);
    }, (err) => {
      console.warn("Failed to listen to patients:", err);
      setLoading(false);
    });

    // Real-time listener for all patient vitals
    const liveReadingsRef = ref(rtdb, 'liveReadings');
    const unsubVitals = onValue(liveReadingsRef, (snapshot) => {
      const readings = snapshot.exists() ? snapshot.val() : {};
      
      // Merge Patients path (capital P) for direct hardware alignment
      const patientsCapRef = ref(rtdb, 'Patients');
      onValue(patientsCapRef, (capSnap) => {
        const capData = capSnap.exists() ? capSnap.val() : {};
        const capMerged: Record<string, any> = {};
        for (const [pid, pData] of Object.entries(capData)) {
          if (pData && (pData as any).liveReading) {
            capMerged[pid] = (pData as any).liveReading;
          }
        }

        // Also listen and merge legacy paths for compatibility
        const legacyRef = ref(rtdb, 'patients');
        onValue(legacyRef, (legSnap) => {
          const legData = legSnap.exists() ? legSnap.val() : {};
          const merged: Record<string, any> = {};
          for (const [pid, pData] of Object.entries(legData)) {
            if (pData && (pData as any).liveVitals) {
              merged[pid] = (pData as any).liveVitals;
            }
          }
          setVitalsMap({ ...merged, ...capMerged, ...readings });
        }, { onlyOnce: true });
      }, { onlyOnce: true });
    });

    return () => {
      unsubPatients();
      unsubVitals();
    };
  }, []);

  const totalCount = patients.length;
  
  const activeCount = patients.filter(p => {
    const pVitals = vitalsMap[p.id] || vitalsMap[p.serialNumber] || (p.id === 'HS-001' ? vitalsMap['HS-001'] : null);
    if (!pVitals) return false;
    const lastUpdate = pVitals.timestamp || pVitals.updatedAt || Date.now();
    return Date.now() - new Date(lastUpdate).getTime() < 30000;
  }).length;

  const criticalCount = patients.filter(p => {
    const pVitals = vitalsMap[p.id] || vitalsMap[p.serialNumber] || (p.id === 'HS-001' ? vitalsMap['HS-001'] : null);
    return checkIsCritical(pVitals);
  }).length;

  const syncedCount = patients.filter(p => {
    const pVitals = vitalsMap[p.id] || vitalsMap[p.serialNumber] || (p.id === 'HS-001' ? vitalsMap['HS-001'] : null);
    return !!pVitals;
  }).length;

  const filteredPatients = patients.filter(p => {
    const matchesSearch = (p.profile?.fullName || p.profile?.name || p.displayName || p.fullName || p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (p.email || p.profile?.email || '').toLowerCase().includes(searchTerm.toLowerCase());
                         
    const pVitals = vitalsMap[p.id] || vitalsMap[p.serialNumber] || (p.id === 'HS-001' ? vitalsMap['HS-001'] : null);
    const isCritical = checkIsCritical(pVitals);
    
    if (!matchesSearch) return false;
    
    if (filter === 'high_risk') return isCritical;
    if (filter === 'active') return !!pVitals;
    return true; // 'all'
  });

  useEffect(() => {
    let hasCritical = false;
    filteredPatients.forEach(p => {
      const pVitals = vitalsMap[p.id] || vitalsMap[p.serialNumber] || vitalsMap['HS-001'];
      if (checkIsCritical(pVitals)) hasCritical = true;
    });

    if (hasCritical) {
      emergencyService.playSiren();
    } else {
      emergencyService.stopSiren();
    }

    return () => {
      // Cleanup siren when leaving page
      emergencyService.stopSiren();
    };
  }, [vitalsMap, filteredPatients]);

  const handleDelete = async (e: React.MouseEvent, patientId: string) => {
    e.stopPropagation(); // Prevent navigating to the patient details page
    if (window.confirm("Are you sure you want to completely remove this patient node?")) {
      try {
        await deleteDoc(doc(db, 'users', patientId));
        // Refresh patients list
        const q = query(
          collection(db, 'users'),
          where('role', '==', 'patient'),
          where('status', '==', 'approved')
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPatients(docs);
      } catch (err) {
        console.error("Failed to delete patient:", err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      <title>Patient Registry | HeartSync</title>
      
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
        <header className="h-20 md:h-24 bg-white border-b border-slate-200 px-6 md:px-12 flex flex-col md:flex-row items-center justify-between shrink-0 py-4 md:py-0">
          <div className="flex items-center gap-4 w-full md:w-auto mb-4 md:mb-0">
             <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-accent-maroon transition-all">
                <Menu className="w-6 h-6" />
             </button>
             <div className="min-w-0">
               <h2 className="text-xl md:text-2xl font-display font-black text-slate-900 tracking-tighter italic truncate">Patient Registry</h2>
               <p className="hidden md:block text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Institutional Care Management</p>
             </div>
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
             <div className="relative group flex-1 md:flex-none">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-accent-maroon transition-colors" />
                <input 
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full md:w-64 lg:w-80 pl-11 pr-6 py-2.5 md:py-3 bg-slate-50 border border-slate-100 rounded-xl md:rounded-2xl outline-none focus:ring-4 focus:ring-accent-maroon/5 focus:border-accent-maroon transition-all font-bold text-sm"
                />
             </div>
             <button className="p-2.5 md:p-3 bg-slate-50 border border-slate-100 rounded-xl md:rounded-2xl text-slate-400 hover:text-accent-maroon transition-all shrink-0">
                <Filter className="w-5 h-5" />
             </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-12 no-scrollbar">
           <div className="max-w-7xl mx-auto space-y-8 md:space-y-10">
              
              {/* STATS OVERVIEW */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                 <RegistryStat label="Total Nodes" value={totalCount} icon={Users} />
                 <RegistryStat label="Active" value={activeCount} icon={Activity} color="green" />
                 <RegistryStat label="Critical" value={criticalCount} icon={Heart} color="red" />
                 <RegistryStat label="Synced" value={syncedCount} icon={Clock} />
              </div>

              {/* INTERACTIVE FILTER TABS */}
              <div className="flex gap-2 p-1.5 bg-slate-100/80 backdrop-blur-sm rounded-2xl w-fit border border-slate-200/50">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === 'all' ? 'bg-white text-slate-900 shadow-premium' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  All ({totalCount})
                </button>
                <button
                  onClick={() => setFilter('active')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === 'active' ? 'bg-white text-slate-900 shadow-premium' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Active ({syncedCount})
                </button>
                <button
                  onClick={() => setFilter('high_risk')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === 'high_risk' ? 'bg-accent-maroon text-white shadow-lg shadow-accent-maroon/20' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Critical ({criticalCount})
                </button>
              </div>

              {/* PATIENT GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
                {loading ? (
                  Array(8).fill(0).map((_, i) => (
                    <div key={i} className="h-80 bg-slate-100 rounded-[40px] animate-pulse" />
                  ))
                ) : filteredPatients.length > 0 ? filteredPatients.map((patient) => {
                  const pVitals = vitalsMap[patient.id] || vitalsMap[patient.serialNumber] || (patient.id === 'HS-001' || patient.email === 'patient@heartsync.health' ? vitalsMap['HS-001'] : null);
                  const isCritical = checkIsCritical(pVitals);
                  
                  return (
                  <motion.div
                    key={patient.id}
                    layoutId={patient.id}
                    onClick={() => {
                      emergencyService.stopSiren();
                      navigate(`/doctor/patient/${patient.id}`);
                    }}
                    className={`group rounded-[40px] border shadow-premium p-8 hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer relative overflow-hidden ${
                      isCritical 
                        ? 'bg-accent-maroon border-accent-maroon text-white ring-4 ring-accent-maroon/20 animate-pulse' 
                        : 'bg-white border-slate-100'
                    }`}
                  >
                     <button 
                       onClick={(e) => handleDelete(e, patient.id)}
                       className={`absolute top-4 left-4 p-3 rounded-2xl z-20 transition-all shadow-md group/btn ${isCritical ? 'bg-white/10 hover:bg-white text-white hover:text-accent-maroon' : 'bg-red-100 hover:bg-red-600 text-red-600 hover:text-white'}`}
                       title="Remove Patient"
                     >
                        <Trash2 className="w-5 h-5" />
                     </button>
                     <div className="absolute top-0 right-0 p-6 z-10 flex items-center gap-2">
                        {isCritical && (
                          <div className="px-3 py-1 bg-white text-accent-maroon rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg">
                            <TriangleAlert className="w-3 h-3" /> Emergency
                          </div>
                        )}
                        <ArrowUpRight className={`w-5 h-5 transition-colors ${isCritical ? 'text-white/60 group-hover:text-white' : 'text-slate-100 group-hover:text-accent-maroon'}`} />
                     </div>
                     
                     <div className="flex flex-col items-center text-center space-y-6 mt-4">
                        <div className="relative">
                           <div className={`w-24 h-24 rounded-3xl flex items-center justify-center text-3xl font-black overflow-hidden border-4 shadow-xl ${isCritical ? 'bg-white text-accent-maroon border-accent-maroon' : 'bg-slate-900 text-white border-slate-50'}`}>
                               {patient.photoURL || patient.profile?.profileImage || patient.profile?.photoURL ? (
                                 <img src={patient.photoURL || patient.profile?.profileImage || patient.profile?.photoURL} alt="" className="w-full h-full object-cover" />
                               ) : (
                                 (patient.profile?.fullName || patient.profile?.name || patient.displayName || patient.fullName || patient.name || 'P').charAt(0).toUpperCase()
                               )}
                           </div>
                           <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-xl border-4 flex items-center justify-center ${isCritical ? 'bg-white border-accent-maroon' : 'bg-green-500 border-white'}`}>
                              <div className={`w-2 h-2 rounded-full animate-pulse ${isCritical ? 'bg-accent-maroon' : 'bg-white'}`} />
                           </div>
                        </div>

                        <div>
                            <h4 className={`text-xl font-black tracking-tighter italic leading-none ${isCritical ? 'text-white' : 'text-slate-900'}`}>
                              {patient.profile?.fullName || patient.profile?.name || patient.displayName || patient.fullName || patient.name || 'Active Patient'}
                            </h4>
                            <p className={`text-[10px] font-black uppercase tracking-widest mt-2 ${isCritical ? 'text-white/70' : 'text-slate-400'}`}>
                              {(patient.profile?.age || patient.profile?.dob || patient.age)
                                ? `${patient.profile?.age || patient.age} Years • ${patient.profile?.gender || patient.gender || '--'}`
                                : 'Details Pending'}
                            </p>
                        </div>

                        <div className={`w-full pt-6 border-t flex items-center justify-around ${isCritical ? 'border-white/10' : 'border-slate-50'}`}>
                           <div className="text-center">
                              <p className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${isCritical ? 'text-white/50' : 'text-slate-400'}`}>Status</p>
                              <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg ${isCritical ? 'bg-white text-accent-maroon' : 'bg-green-50 text-green-600'}`}>
                                {isCritical ? 'CRITICAL' : 'Stable'}
                              </span>
                           </div>
                           <div className="text-center">
                              <p className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${isCritical ? 'text-white/50' : 'text-slate-400'}`}>Risk</p>
                              <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg ${isCritical ? 'bg-white/20 text-white' : 'bg-slate-50 text-slate-400'}`}>
                                {isCritical ? 'HIGH RISK' : 'Normal'}
                              </span>
                           </div>
                        </div>
                     </div>
                  </motion.div>
                )}) : (
                  <div className="col-span-full py-20 text-center">
                     <div className="w-20 h-20 bg-slate-100 rounded-[32px] flex items-center justify-center mx-auto mb-6">
                        <Search className="w-8 h-8 text-slate-300" />
                     </div>
                     <h3 className="text-xl font-black text-slate-900 tracking-tight italic">No active users found</h3>
                     <p className="text-xs font-bold text-slate-400 mt-2">All connected nodes are currently stable.</p>
                  </div>
                )}
              </div>
           </div>
        </div>
      </main>
    </div>
  );
};

const RegistryStat = ({ label, value, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-5">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
      color === 'green' ? 'bg-green-500/10 text-green-500' :
      color === 'red' ? 'bg-accent-maroon/10 text-accent-maroon' :
      'bg-slate-50 text-slate-400'
    }`}>
      <Icon className="w-6 h-6" />
    </div>
    <div>
      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-900 tracking-tighter italic leading-none">{value}</p>
    </div>
  </div>
);

export default DoctorPatients;
