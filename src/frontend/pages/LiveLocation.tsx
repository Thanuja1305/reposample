import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Navigation, 
  Menu,
  Activity,
  ShieldAlert,
  MapPin,
  Search,
  AlertTriangle
} from 'lucide-react';
import GoogleMapsTracker from '../components/GoogleMapsTracker';
import PatientSidebar from '../components/PatientSidebar';
import { useAuth } from '../context/AuthContext';
import { db, rtdb, handleFirestoreError, OperationType } from '../../shared/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, onValue, set } from 'firebase/database';
import { locationService } from '../../backend/services/locationService';

const LOCAL_GEOCODE_DB: Record<string, { lat: number; lng: number; displayName: string }> = {
  'koti': { lat: 17.3850, lng: 78.4867, displayName: 'Koti, Hyderabad, Telangana' },
  'koti clinic': { lat: 17.3850, lng: 78.4867, displayName: 'Koti, Hyderabad, Telangana' },
  'koti women\'s college': { lat: 17.3850, lng: 78.4867, displayName: 'Koti Women\'s College, Hyderabad, Telangana' },
  'hyderabad': { lat: 17.3850, lng: 78.4867, displayName: 'Hyderabad, Telangana, India' },
  'hyderabad center': { lat: 17.3850, lng: 78.4867, displayName: 'Hyderabad, Telangana, India' },
  'gachibowli': { lat: 17.4401, lng: 78.3489, displayName: 'Gachibowli, Hyderabad, Telangana' },
  'gachibowli tech': { lat: 17.4401, lng: 78.3489, displayName: 'Gachibowli, Hyderabad, Telangana' },
  'madhapur': { lat: 17.4483, lng: 78.3741, displayName: 'Madhapur, Hyderabad, Telangana' },
  'jubilee hills': { lat: 17.4325, lng: 78.4071, displayName: 'Jubilee Hills, Hyderabad, Telangana' },
  'banjara hills': { lat: 17.4175, lng: 78.4475, displayName: 'Banjara Hills, Hyderabad, Telangana' },
  'secunderabad': { lat: 17.4399, lng: 78.4983, displayName: 'Secunderabad, Telangana, India' },
  'begumpet': { lat: 17.4375, lng: 78.4482, displayName: 'Begumpet, Hyderabad, Telangana' },
  'charminar': { lat: 17.3616, lng: 78.4747, displayName: 'Charminar, Hyderabad, Telangana' },
  'kukatpally': { lat: 17.4834, lng: 78.4084, displayName: 'Kukatpally, Hyderabad, Telangana' },
  'hitech city': { lat: 17.4504, lng: 78.3808, displayName: 'HITEC City, Madhapur, Hyderabad' },
  'ameerpet': { lat: 17.4374, lng: 78.4446, displayName: 'Ameerpet, Hyderabad, Telangana' },
  'bangalore': { lat: 12.9716, lng: 77.5946, displayName: 'Bangalore, Karnataka, India' },
  'bangalore hub': { lat: 12.9716, lng: 77.5946, displayName: 'Bangalore, Karnataka, India' },
  'bengaluru': { lat: 12.9716, lng: 77.5946, displayName: 'Bengaluru, Karnataka, India' },
  'mumbai': { lat: 19.0760, lng: 72.8777, displayName: 'Mumbai, Maharashtra, India' },
  'mumbai port': { lat: 19.0760, lng: 72.8777, displayName: 'Mumbai, Maharashtra, India' },
  'bombay': { lat: 19.0760, lng: 72.8777, displayName: 'Mumbai, Maharashtra, India' },
  'delhi': { lat: 28.6139, lng: 77.2090, displayName: 'New Delhi, Delhi, India' },
  'delhi aiims': { lat: 28.6139, lng: 77.2090, displayName: 'New Delhi, Delhi, India' },
  'new delhi': { lat: 28.6139, lng: 77.2090, displayName: 'New Delhi, Delhi, India' },
  'chennai': { lat: 13.0827, lng: 80.2707, displayName: 'Chennai, Tamil Nadu, India' },
  'madras': { lat: 13.0827, lng: 80.2707, displayName: 'Chennai, Tamil Nadu, India' },
  'pune': { lat: 18.5204, lng: 73.8567, displayName: 'Pune, Maharashtra, India' },
  'kolkata': { lat: 22.5726, lng: 88.3639, displayName: 'Kolkata, West Bengal, India' },
  'calcutta': { lat: 22.5726, lng: 88.3639, displayName: 'Kolkata, West Bengal, India' },
  'ahmedabad': { lat: 23.0225, lng: 72.5714, displayName: 'Ahmedabad, Gujarat, India' },
  'jaipur': { lat: 26.9124, lng: 75.7873, displayName: 'Jaipur, Rajasthan, India' },
  'lucknow': { lat: 26.8467, lng: 80.9462, displayName: 'Lucknow, Uttar Pradesh, India' },
};

const LiveLocation = ({ isEmbedded = false }: { isEmbedded?: boolean }) => {
  const { user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [patientData, setPatientData] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [vitals, setVitals] = useState<any>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [manualCity, setManualCity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // Autocomplete debounced query hook for Rapido-style instant lookup!
  useEffect(() => {
    if (manualCity.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        const queryTerm = manualCity.trim().toLowerCase();
        
        // Match from local geocoding DB first
        const localMatches = Object.keys(LOCAL_GEOCODE_DB)
          .filter(key => key.includes(queryTerm))
          .slice(0, 3)
          .map(key => ({
            display_name: LOCAL_GEOCODE_DB[key].displayName,
            lat: LOCAL_GEOCODE_DB[key].lat.toString(),
            lon: LOCAL_GEOCODE_DB[key].lng.toString(),
            isLocal: true
          }));

        // Fetch from OSM Nominatim as fallback/supplement
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(manualCity)}&format=json&limit=4&countrycodes=in`);
        if (response.ok) {
          const data = await response.json();
          const apiMatches = (data || []).map((item: any) => ({
            display_name: item.display_name,
            lat: item.lat,
            lon: item.lon,
            isLocal: false
          }));

          // Merge local & API results (removing duplicates by name)
          const merged = [...localMatches, ...apiMatches];
          const unique = merged.filter((v, i, a) => a.findIndex(t => t.display_name === v.display_name) === i);
          setSuggestions(unique.slice(0, 5));
        } else {
          setSuggestions(localMatches);
        }
      } catch (err) {
        console.error("Autocomplete failed:", err);
        // Fallback to local filtering
        const localMatches = Object.keys(LOCAL_GEOCODE_DB)
          .filter(key => key.includes(manualCity.trim().toLowerCase()))
          .slice(0, 5)
          .map(key => ({
            display_name: LOCAL_GEOCODE_DB[key].displayName,
            lat: LOCAL_GEOCODE_DB[key].lat.toString(),
            lon: LOCAL_GEOCODE_DB[key].lng.toString(),
            isLocal: true
          }));
        setSuggestions(localMatches);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [manualCity]);

  // 1. Initialize Patient Data & Vitals (from RTDB patients/HS-001/liveVitals)
  useEffect(() => {
    if (user) {
      onSnapshot(doc(db, 'patients', user.uid), (snap) => {
        if (snap.exists()) setPatientData(snap.data());
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, `patients/${user.uid}`);
      });
      
      // 🔥 Read live vitals from new RTDB path
      const vitalsRef = ref(rtdb, 'patients/HS-001/liveVitals');
      const unsubVitals = onValue(vitalsRef, (snapshot) => {
        if (snapshot.exists()) {
          setVitals(snapshot.val());
        }
      });

    }
  }, [user]);

  const updateDatabaseLocation = async (lat: number, lng: number, address: string) => {
    const activeUid = user?.uid || 'HS-001';
    const data = {
      lat,
      lng,
      updatedAt: Date.now(),
      isManual: true,
      address
    };
    
    // Write to active UID path
    const mainRef = ref(rtdb, `liveHealthMetrics/${activeUid}/location`);
    await set(mainRef, data);
    
    // Double write to HS-001 fallback path if active UID is different
    if (activeUid !== 'HS-001') {
      const fallbackRef = ref(rtdb, 'liveHealthMetrics/HS-001/location');
      await set(fallbackRef, data);
    }
  };

  // 2. Start Live GPS Tracking & Subscribe to RTDB Location
  useEffect(() => {
    const activeUid = user?.uid || 'HS-001';

    // Sync local GPS to RTDB
    const watchId = locationService.startTracking(
      activeUid, 
      undefined, 
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError("Location permission required");
        } else {
          setGpsError("Location signal weak");
        }
      }
    );

    // Subscribe to RTDB location for realtime GPS marker movement
    const locationRef = ref(rtdb, `liveHealthMetrics/${activeUid}/location`);
    const unsubscribe = onValue(locationRef, (snap) => {
      if (snap.exists()) {
        const loc = snap.val();
        if (loc?.lat && loc?.lng) {
          setCurrentLocation({ lat: Number(loc.lat), lng: Number(loc.lng) });
          setGpsError(null);
        }
      }
    });

    return () => {
      locationService.stopTracking(watchId);
      unsubscribe();
    };
  }, [user]);

  const handleManualSync = async (e?: React.FormEvent, customCity?: string) => {
    if (e) e.preventDefault();
    const targetCity = (customCity || manualCity).trim();
    if (!targetCity) return;
    setIsSubmitting(true);
    setSuccessMsg('');
    setGpsError(null);

    const queryKey = targetCity.toLowerCase().replace(/[^a-z0-9]/g, ' ');

    // 1. Check local lookup dictionary first (100% reliable, zero network CORS issue!)
    // First, look for an exact/direct match
    let matchedKey = Object.keys(LOCAL_GEOCODE_DB).find(k => k === queryKey);

    // If no direct match, check if any dictionary key is a substring or contains a significant word
    if (!matchedKey) {
      const words = queryKey.split(/\s+/);
      const sortedKeys = Object.keys(LOCAL_GEOCODE_DB).sort((a, b) => b.length - a.length);
      
      matchedKey = sortedKeys.find(key => {
        // Does the typed query contain this key? (e.g. "hyderabad gachibowli tech" contains "gachibowli tech")
        if (queryKey.includes(key)) return true;
        // Does this key contain the typed query? (e.g. "gachibowli" contains "gachibow")
        if (key.includes(queryKey)) return true;
        // Or do they share common words longer than 3 characters?
        return words.some(word => word.length > 3 && key.includes(word));
      });
    }

    if (matchedKey) {
      const match = LOCAL_GEOCODE_DB[matchedKey];
      try {
        await updateDatabaseLocation(match.lat, match.lng, match.displayName);
        setSuccessMsg(`Linked successfully: ${match.displayName.split(',')[0]}!`);
        setManualCity('');
        setIsSubmitting(false);
        return;
      } catch (dbErr) {
        console.error(dbErr);
        setGpsError("Database sync failed. Try again.");
        setIsSubmitting(false);
        return;
      }
    }

    // 2. Network geocoding fallback
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(targetCity)}&format=json&limit=1`);
      if (response.ok) {
        const data = await response.json();
        if (data && data[0]) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          const displayName = data[0].display_name;

          await updateDatabaseLocation(lat, lon, displayName);
          
          setSuccessMsg(`Linked successfully!`);
          setManualCity('');
        } else {
          setGpsError("Address not found. Enter a valid city or landmark.");
        }
      } else {
        setGpsError("Server error. Try again shortly.");
      }
    } catch (err) {
      console.error(err);
      setGpsError("Failed to synchronize. Try popular preset button.");
    } finally {
      setIsSubmitting(false);
    }
  };



  const mapContent = (
      <div className={`relative bg-slate-950 flex items-center justify-center ${isEmbedded ? 'w-full h-full' : 'flex-1 p-6 sm:p-12'}`}>
        {!currentLocation ? (
          /* OFFLINE MANUAL LOCATION SYNC OVERLAY */
          <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-2xl border border-slate-800/80 p-8 rounded-[32px] shadow-2xl relative overflow-hidden z-10">
            <div className="absolute top-[-50%] right-[-10%] w-64 h-64 bg-red-500/10 rounded-full blur-[100px]" />
            
            <div className="space-y-6 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500/20 border border-red-500/30 rounded-2xl flex items-center justify-center animate-pulse">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-wider italic">GPS Uplink Down</h2>
                  <p className="text-[9px] font-black text-red-500 uppercase tracking-[0.2em] mt-0.5 animate-pulse">Satellite Link Offline</p>
                </div>
              </div>

              <p className="text-xs font-medium text-slate-400 leading-relaxed">
                Emergency ambulance routing and cardiologist searches require your clinical coordinates. Please grant location permission, or enter your real city/landmark manually below to sync your status.
              </p>

              {gpsError && (
                gpsError === "Location permission required" ? (
                  <div className="p-4 bg-slate-950/85 border border-slate-800/80 rounded-2xl flex items-center gap-3">
                    <Navigation className="w-4 h-4 text-blue-500 shrink-0 animate-pulse" />
                    <div>
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-wider mb-0.5">Secure Manual Node Dispatch</p>
                      <p className="text-[10px] font-semibold text-slate-400 leading-snug">Browser GPS permission is blocked/passive. Use presets or search below to link coordinates.</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-red-950/30 border border-red-900/30 rounded-2xl flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-bounce" />
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide leading-tight">{gpsError}</p>
                  </div>
                )
              )}

              {successMsg && (
                <div className="p-4 bg-emerald-950/30 border border-emerald-900/30 rounded-2xl flex items-center gap-3">
                  <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide leading-tight">{successMsg}</p>
                </div>
              )}

              <form onSubmit={handleManualSync} className="space-y-4">
                <div className="relative group">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Enter City / Address (e.g. Mumbai, Koti)" 
                    value={manualCity}
                    onChange={(e) => setManualCity(e.target.value)}
                    className="w-full bg-slate-950 border-none rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-300 placeholder:text-slate-600 outline-none"
                  />
                </div>

                {/* AUTOCOMPLETE SUGGESTIONS DROPDOWN (like Rapido!) */}
                <AnimatePresence>
                  {suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute left-0 right-0 mt-1 bg-slate-950/98 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto divide-y divide-slate-800/50"
                    >
                      {suggestions.map((item, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={async () => {
                            const lat = parseFloat(item.lat);
                            const lon = parseFloat(item.lon);
                            const displayName = item.display_name;
                            
                            setIsSubmitting(true);
                            setGpsError(null);
                            setSuccessMsg('');
                            
                            try {
                              await updateDatabaseLocation(lat, lon, displayName);
                              setSuccessMsg(`Linked successfully: ${displayName.split(',')[0]}!`);
                              setManualCity('');
                              setSuggestions([]);
                            } catch (err) {
                              console.error(err);
                              setGpsError("Database sync failed.");
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          className="w-full px-5 py-3 text-left text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-900 transition-colors flex items-start gap-2.5 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                          <span className="truncate flex-1">{item.display_name}</span>
                          {item.isLocal && (
                            <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase rounded tracking-wider">Preset</span>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-blue-600 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Syncing Grid...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>Establish GPS Node</span>
                    </>
                  )}
                </button>
              </form>

              {/* POPULAR PRESETS */}
              <div className="space-y-2.5 pt-2">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.15em]">Popular Emergency Nodes</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Koti Center', query: 'koti' },
                    { label: 'Gachibowli Tech', query: 'gachibowli' },
                    { label: 'Madhapur Hub', query: 'madhapur' },
                    { label: 'Bangalore Clinic', query: 'bangalore' },
                    { label: 'Mumbai Port', query: 'mumbai' },
                    { label: 'Delhi AIIMS', query: 'delhi' }
                  ].map((preset) => (
                    <button
                      key={preset.query}
                      type="button"
                      onClick={() => {
                        setManualCity(preset.label);
                        handleManualSync(undefined, preset.query);
                      }}
                      disabled={isSubmitting}
                      className="px-2.5 py-1.5 bg-slate-950/80 hover:bg-slate-800 text-[8px] font-black text-slate-400 hover:text-white rounded-xl border border-slate-800/60 transition-all uppercase tracking-wider cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center text-[9px] font-black text-slate-500 uppercase tracking-widest">
                <span>Satellite Link: Passive</span>
                <span className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  Awaiting Sync
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* FULLSCREEN REALTIME TACTICAL MAP */
          <>
            <div className="absolute inset-0 z-0 bg-slate-950">
              <GoogleMapsTracker />
            </div>

            {/* TRACKING STATUS HEADER (HUD STYLE) */}
            <div className="absolute top-6 left-6 z-10 flex flex-col gap-4">
               <header className="h-20 bg-slate-900/90 backdrop-blur-2xl border border-slate-800 px-8 flex items-center gap-6 rounded-[24px] shadow-2xl">
                 <div className="p-3 bg-blue-600 rounded-xl shrink-0 shadow-lg shadow-blue-500/20 animate-pulse">
                   <Navigation className="w-5 h-5 text-white" />
                 </div>
                 <div>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] leading-none mb-1">Emergency Dispatch Grid</p>
                    <h1 className="text-lg font-black text-white tracking-tight uppercase italic text-emerald-400">Linked</h1>
                 </div>
               </header>

               {(vitals?.emergency || vitals?.isAbnormal) && (
                 <motion.div 
                   initial={{ x: -20, opacity: 0 }}
                   animate={{ x: 0, opacity: 1 }}
                   className="bg-red-600/90 backdrop-blur-xl text-white p-6 rounded-[24px] shadow-2xl flex items-center gap-6 border border-red-500/50"
                 >
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center animate-pulse">
                       <Activity className="w-6 h-6" />
                    </div>
                    <div>
                       <p className="text-[10px] font-black uppercase tracking-widest opacity-80 italic">Cardiac Alert Active</p>
                       <p className="text-lg font-black tracking-tight leading-tight uppercase">Medical Node In-Transit</p>
                    </div>
                 </motion.div>
               )}
            </div>
          </>
        )}

        {/* MOBILE TOGGLE */}
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden absolute top-6 left-6 z-20 p-4 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl text-slate-400"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>
  );

  if (isEmbedded) return mapContent;

  return (
    <div className="flex h-screen bg-[#0F172A] overflow-hidden relative font-sans text-slate-100">
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[65] lg:hidden"
          />
        )}
      </AnimatePresence>

      <PatientSidebar 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        patientData={patientData} 
      />

      {mapContent}
    </div>
  );
};

export default LiveLocation;
