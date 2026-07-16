import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../shared/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Search, Filter, Menu, ArrowUpRight } from 'lucide-react';
import DoctorSidebar from '../components/DoctorSidebar';

// This component fetches patients whose latest vitals indicate a critical condition.
// It assumes each patient document contains a sub‑collection "latestVitals" with a field
// "severity" that can be "CRITICAL", "HIGH", "MODERATE" etc.

const CriticalPatients = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    // Query only approved patients.
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'patient'),
      where('status', '==', 'approved')
    );
    const unsubscribe = onSnapshot(q, snap => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter patients that have a "latestVitals" field with severity CRITICAL.
      const critical = docs.filter((p: any) => {
        // "latestVitals" may be a nested object stored directly on the patient doc
        // or a reference to a sub‑collection. Adjust as needed.
        const severity = (p.latestVitals && p.latestVitals.severity) || '';
        return severity.toUpperCase() === 'CRITICAL';
      });
      setPatients(critical);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
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
        <header className="h-20 md:h-24 bg-white border-b border-slate-200 px-6 md:px-12 flex items-center justify-between shrink-0 py-4 md:py-0">
          <div className="flex items-center gap-4 w-full md:w-auto mb-4 md:mb-0">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-accent-maroon transition-all">
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter italic truncate">Critical Patients</h2>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-12 no-scrollbar">
          {loading ? (
            <div className="text-center py-20">Loading...</div>
          ) : patients.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-xl text-slate-600">No critical patients at the moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
              {patients.map(patient => (
                <motion.div
                  key={patient.id}
                  layoutId={patient.id}
                  onClick={() => navigate(`/doctor/patient/${patient.id}`)}
                  className="group bg-white rounded-[40px] border border-slate-100 shadow-premium p-8 hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-6">
                    <ArrowUpRight className="w-5 h-5 text-slate-100 group-hover:text-accent-maroon transition-colors" />
                  </div>
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-24 h-24 bg-slate-900 rounded-3xl flex items-center justify-center text-white text-3xl font-black overflow-hidden border-4 border-slate-50 shadow-xl">
                      {patient.photoURL ? (
                        <img src={patient.photoURL} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (patient.displayName || 'P').charAt(0)
                      )}
                    </div>
                    <h4 className="text-xl font-black text-slate-900 tracking-tighter italic leading-none">
                      {patient.displayName || 'Unnamed Patient'}
                    </h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                      {patient.age ? `${patient.age} Years` : 'Age N/A'} • {patient.occupation || 'Occupation N/A'}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CriticalPatients;
