import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Shield, Activity, Zap, ArrowRight, CheckCircle2, BarChart3, Mail, Phone, MapPin, Send, AlertCircle, Clock, Stethoscope, Share2, Globe, Lock, Brain, Database, Layers, ShieldAlert, Ambulance, BellRing, HeartPulse, LineChart } from 'lucide-react';
import Navbar from '../components/Navbar';
import LiveLocationMap from '../components/LiveLocationMap';
import { useAuth } from '../context/AuthContext';

const Landing = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && profile?.role) {
      if (profile.role === 'admin') navigate('/admin');
      else if (profile.role === 'patient') navigate('/patient/dashboard');
      else if (profile.role === 'doctor') navigate('/doctor/dashboard');
    }
  }, [user, profile, navigate]);

  return (
    <div className="min-h-screen bg-white">
      <title>HeartSync | Emergency Cardiac Protocol</title>
      <Navbar />

      {/* HERO SECTION */}
      <section id="home" className="relative pt-32 md:pt-44 pb-16 md:pb-32 px-4 md:px-6 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] md:w-[1000px] h-[300px] md:h-[600px] bg-accent-maroon/5 rounded-full blur-[80px] md:blur-[140px] opacity-60" />
          <div className="absolute top-[20%] right-0 w-[150px] md:w-[400px] h-[150px] md:h-[400px] bg-dark-navy/5 rounded-full blur-[60px] md:blur-[120px]" />
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 md:gap-20 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-left"
            >
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-white border border-dark-navy/5 rounded-full mb-6 md:mb-8 shadow-sm">
                <div className="w-1.5 h-1.5 bg-accent-maroon rounded-full animate-pulse" />
                <span className="text-[7.5px] md:text-[9px] font-black text-dark-navy/60 uppercase tracking-[0.2em] md:tracking-[0.3em]">Institutional Grade Synchronization</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-display font-black leading-[1.1] mb-6 md:mb-8 text-dark-navy tracking-tighter">
                Synchronizing <span className="text-accent-maroon">Every Heartbeat</span> with Life-Saving Precision
              </h1>
              
              <p className="text-muted text-sm md:text-lg leading-relaxed mb-8 md:mb-12 font-medium">
                Advanced emergency coordination platform for real-time cardiac monitoring and instant medical response propagation across the global health grid.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-start gap-4 md:gap-6">
                <Link 
                  to="/select-role" 
                  className="w-full sm:w-auto group px-8 md:px-10 py-4 md:py-5 bg-dark-navy text-white text-[10px] md:text-[11px] font-black uppercase tracking-[0.25em] rounded-full shadow-2xl shadow-dark-navy/20 hover:bg-accent-maroon hover:shadow-accent-maroon/20 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-3"
                >
                  Establish Connection <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </motion.div>

            {/* Right Visual (Heart Related) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 30 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <motion.div 
                animate={{ y: [-15, 15, -15] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="relative w-full aspect-square max-w-[700px] ml-auto flex items-center justify-center"
                style={{ perspective: 1200 }}
              >
                {/* Subtle Ambient Glow behind the heart */}
                <motion.div 
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] bg-accent-maroon/10 rounded-full blur-[80px] -z-10"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* 3D Floating Heart with Slow, Steady Pacing */}
                <motion.img 
                  src="/heart_sync_hero.png" 
                  alt="Realistic 3D anatomical human heart" 
                  className="w-full h-full object-contain relative z-10 origin-center"
                  style={{ mixBlendMode: 'multiply' }}
                  animate={{ 
                    scale: [1, 1.08, 1],
                    z: [0, 40, 0],
                    rotateY: [0, 3, 0],
                    rotateX: [0, -1.5, 0]
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
              </motion.div>
            </motion.div>
          </div>

          {/* ECG Line Visualization */}
          <div className="relative mt-20 md:mt-24 h-24 md:h-32 w-full overflow-hidden opacity-30 select-none">
            <svg className="w-full h-full" viewBox="0 0 1400 100" preserveAspectRatio="none">
              <motion.path
                d="M0,50 L200,50 L220,30 L240,70 L260,50 L400,50 L420,10 L440,90 L460,50 L700,50 L720,40 L740,60 L760,50 L900,50 L920,20 L940,80 L960,50 L1100,50 L1120,45 L1140,55 L1160,50 L1400,50"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-accent-maroon"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
            </svg>
          </div>
        </div>
      </section>

      {/* CORE INFRASTRUCTURE - FEATURE GRID */}
      <section id="features" className="py-24 md:py-32 px-4 md:px-6 bg-[#FAFAFA] border-y border-dark-navy/5 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between md:items-end gap-10 mb-16 md:mb-20">
            <div className="max-w-2xl">
              <p className="text-[10px] font-black text-accent-maroon uppercase tracking-[0.3em] mb-4">Patient Intelligence Node</p>
              <h2 className="text-3xl md:text-6xl font-display font-black text-dark-navy tracking-tight leading-tight mb-4">
                Real-Time Emergency <span className="text-accent-maroon italic">Healthcare</span> Intelligence
              </h2>
              <p className="text-muted text-sm md:text-base font-medium leading-relaxed opacity-70">
                AI-powered live cardiac monitoring and emergency response infrastructure built for real-world patient safety.
              </p>
            </div>
            <div className="flex gap-4">
              <div className="px-4 py-2 bg-white rounded-xl border border-dark-navy/5 flex items-center gap-2 w-fit">
                <Shield className="w-3 h-3 text-accent-maroon" />
                <span className="text-[9px] font-black uppercase tracking-widest text-dark-navy/60">Compliance Verified</span>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[
              { icon: HeartPulse, title: "Live Health Monitoring", desc: "Track real-time BPM, SpO\u2082, ECG, temperature, and humidity directly from Firebase-connected IoT sensors." },
              { icon: ShieldAlert, title: "AI Emergency Detection", desc: "AI continuously analyzes patient vitals and instantly detects dangerous cardiac abnormalities or emergency conditions." },
              { icon: Stethoscope, title: "Doctor Live Connectivity", desc: "Nearby cardiologists receive live patient data, ECG streams, and emergency alerts in real time." },
              { icon: Ambulance, title: "Smart Ambulance Dispatch", desc: "Automatically locate and connect the nearest available ambulance during emergency situations." },
              { icon: MapPin, title: "Live GPS Tracking", desc: "Track patient location, nearby hospitals, ambulances, and emergency responders with real-time GPS updates." },
              { icon: Database, title: "Firebase Real-Time Sync", desc: "All health metrics and alerts update instantly across patient, doctor, and emergency dashboards." },
              { icon: BellRing, title: "Emergency Contact Alerts", desc: "Instantly notify family members, guardians, and emergency contacts during critical health situations." },
              { icon: LineChart, title: "ECG Live Visualization", desc: "Real-time ECG waveform monitoring with smooth live rendering and doctor-accessible analytics." }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="group p-8 bg-white rounded-[32px] border border-dark-navy/5 hover:border-accent-maroon/20 hover:shadow-2xl hover:shadow-dark-navy/5 transition-all duration-500"
              >
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-accent-maroon mb-6 group-hover:bg-accent-maroon group-hover:text-white transition-all duration-300">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-black text-dark-navy mb-4 uppercase tracking-tighter">{feature.title}</h4>
                <p className="text-muted text-xs leading-relaxed font-medium">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>



      {/* ABOUT SECTION - AI ASSESSMENT PREVIEW */}
      <section id="about" className="py-24 md:py-32 px-4 md:px-6 bg-[#FAFAFA] relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 md:gap-20 items-center">
            <div>
              <p className="text-[10px] font-black text-accent-maroon uppercase tracking-[0.3em] mb-4">Neural Diagnostics</p>
              <h2 className="text-3xl md:text-6xl font-display font-black text-dark-navy mb-6 md:mb-8 tracking-tighter leading-[1.05]">
                Bridging the Gap Between <span className="text-accent-maroon">Symptom</span> and Response
              </h2>
              <p className="text-muted text-sm md:text-lg mb-8 md:mb-10 leading-relaxed font-medium">
                Our protocol leverages advanced neural pattern recognition to identify potential cardiac events before they become critical. Experience sub-second triage and medical coordination.
              </p>
              
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                {[
                  { label: "Pattern Recognition", value: "99.8%" },
                  { label: "Response Coordination", value: "< 2s" },
                  { label: "Verified Nodes", value: "4.2k+" },
                  { label: "Live Monitoring", value: "24/7" }
                ].map((stat, i) => (
                  <div key={i} className="p-6 bg-white rounded-2xl border border-dark-navy/5 shadow-sm">
                    <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">{stat.label}</p>
                    <p className="text-2xl font-black text-dark-navy tracking-tighter">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="w-full h-[500px] bg-dark-navy rounded-[48px] shadow-premium overflow-hidden relative group"
              >
                <div className="absolute inset-0 opacity-100">
                  <img src="/neural_cardiac_analysis.png" alt="AI Neural Cardiac Analysis" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-dark-navy via-dark-navy/40 to-transparent" />
                <div className="relative h-full p-12 flex flex-col justify-end">
                   <div className="w-16 h-1 bg-accent-maroon mb-6" />
                   <h4 className="text-2xl font-display font-black text-white mb-2 uppercase tracking-tighter">AI Analysis Engine</h4>
                   <p className="text-white/50 text-sm font-medium">Real-time telemetry processing across distributed medical clusters.</p>
                </div>
              </motion.div>
              {/* Floating Element */}
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute -top-10 -right-10 p-6 bg-white rounded-3xl border border-dark-navy/5 shadow-2xl z-20 hidden md:block"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-accent-maroon-light rounded-xl flex items-center justify-center text-accent-maroon">
                    <Heart className="w-5 h-5 fill-accent-maroon" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-muted uppercase tracking-widest">Active Pulse</p>
                    <p className="text-xl font-black text-dark-navy tracking-tighter">72 BPM</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE TRACKING PREVIEW */}
      <section className="py-16 md:py-24 px-4 md:px-6 bg-dark-navy overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-accent-maroon/10 rounded-full blur-[80px] md:blur-[140px] -mr-40 md:-mr-80 -mt-40 md:-mt-80" />
          <div className="absolute bottom-0 left-0 w-[300px] md:w-[400px] h-[300px] md:h-[400px] bg-accent-maroon/5 rounded-full blur-[80px] md:blur-[120px] -ml-20 md:-ml-40 -mb-20 md:-mb-40" />
        </div>
        
        <div className="max-w-7xl mx-auto relative cursor-default">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-white/5 border border-white/10 rounded-full mb-6">
                <div className="w-1.5 h-1.5 bg-accent-maroon rounded-full animate-pulse" />
                <span className="text-[7.5px] md:text-[9px] font-black text-white/60 uppercase tracking-[0.2em] md:tracking-[0.3em]">Live Node Synchronization</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-display font-medium text-white mb-6 md:mb-8 tracking-tighter leading-[1.1]">
                Unifying the Healthcare <span className="text-accent-maroon italic">Response Grid</span>
              </h2>
              <p className="text-white/50 text-sm md:text-base leading-relaxed mb-8 md:mb-10 font-medium max-w-lg">
                Experience sub-second coordination. In an emergency, our protocol synchronizes telemetry across ambulances and centers instantly.
              </p>
              
              <div className="grid grid-cols-1 gap-4 md:gap-6">
                {[
                  { title: "Telemetry Broadcast", desc: "Continuous vital streaming to the nearest response unit." },
                  { title: "Dynamic Routing", desc: "Hospitals selected based on live clinical capacity." },
                  { title: "SOS Propagation", desc: "Multi-channel notifications across all verified nodes." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-5 group">
                    <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-accent-maroon group-hover:border-accent-maroon transition-all duration-300">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-white mb-1 uppercase tracking-wider">{item.title}</h4>
                      <p className="text-xs text-white/40 font-medium leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
            >
              <div className="h-[450px] md:h-[600px] w-full rounded-[32px] overflow-hidden border border-white/10 shadow-2xl relative">
                <LiveLocationMap 
                  patientPosition={[40.7484, -73.9857]}
                  isEmergency={true}
                  hospitals={[
                    { name: "NYU Langone Heart Center", position: [40.7410, -73.9740], type: "Tertiary" },
                    { name: "Bellevue Cardiac Care", position: [40.7415, -73.9785], type: "Emergency" }
                  ]}
                  ambulancePosition={[40.7450, -73.9800]}
                />
                
                {/* Active Session Overlay */}
                <div className="absolute top-4 left-4 z-10 pointer-events-none">
                  <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-dark-navy/5 min-w-[140px]">
                    <div className="flex items-center gap-3 mb-2 text-medical-red">
                      <div className="w-1.5 h-1.5 bg-medical-red rounded-full animate-pulse" />
                      <p className="text-[9px] font-black uppercase tracking-widest">Active Signal</p>
                    </div>
                    <p className="text-2xl font-black text-dark-navy tracking-tighter">142 <span className="text-xs font-bold text-muted ml-1 uppercase">BPM</span></p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
      
      {/* CONTACT SECTION */}
      <section id="contact" className="py-16 md:py-20 px-4 md:px-6 bg-[#FAFAFA] border-t border-dark-navy/5 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 md:gap-16 items-start">
            <div>
              <p className="text-[10px] font-black text-accent-maroon uppercase tracking-[0.3em] mb-4">Connect with us</p>
              <h2 className="text-3xl md:text-5xl font-display font-medium mb-6 text-dark-navy tracking-tight">Institutional Inquiries</h2>
              <p className="text-muted mb-8 md:mb-12 text-sm md:text-base font-medium leading-relaxed max-w-md">For clinical partnerships, hospital integrations, or emergency node verification, please contact our implementation team.</p>
              
              <div className="grid grid-cols-1 gap-4">
                {[
                  { icon: Mail, label: "Implementation Node", value: "sync@heartsync.health" },
                  { icon: MapPin, label: "Global Operations", value: "New York Hub, USA" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-6 p-6 bg-white rounded-3xl border border-dark-navy/5 shadow-sm">
                    <div className="p-3 bg-accent-maroon-light rounded-xl text-accent-maroon">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-1">{item.label}</p>
                      <p className="text-sm font-bold text-dark-navy">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col gap-6">
              <div className="bg-white p-6 md:p-10 rounded-[32px] border border-dark-navy/5 shadow-2xl shadow-dark-navy/5">
                <form className="space-y-4 md:space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
                    <div className="space-y-1.5 md:space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Entity Name</label>
                      <input type="text" className="w-full px-5 py-3 md:py-3.5 bg-slate-50 border border-dark-navy/5 rounded-xl text-sm focus:border-accent-maroon/20 outline-none transition-all placeholder:text-slate-300" placeholder="John Doe" />
                    </div>
                    <div className="space-y-1.5 md:space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Email Node</label>
                      <input type="email" className="w-full px-5 py-3 md:py-3.5 bg-slate-50 border border-dark-navy/5 rounded-xl text-sm focus:border-accent-maroon/20 outline-none transition-all placeholder:text-slate-300" placeholder="john@sync.health" />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Transmission Context</label>
                    <textarea rows={4} className="w-full px-5 py-3 md:py-3.5 bg-slate-50 border border-dark-navy/5 rounded-xl text-sm focus:border-accent-maroon/20 outline-none transition-all resize-none placeholder:text-slate-300" placeholder="Describe your inquiry..." />
                  </div>
                  <button className="w-full py-4 bg-dark-navy text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-accent-maroon transition-all duration-300 shadow-xl shadow-dark-navy/20">
                    Transmit Message
                  </button>
                </form>
              </div>
              
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="w-full h-[300px] rounded-[32px] overflow-hidden border border-dark-navy/5 shadow-premium relative marquee-grayscale grayscale group hover:grayscale-0 transition-all duration-700"
              >
                <LiveLocationMap 
                  patientPosition={[40.7484, -73.9857]}
                  isEmergency={false}
                />
                <div className="absolute inset-0 bg-accent-maroon/5 pointer-events-none group-hover:bg-transparent transition-all" />
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-dark-navy pt-16 pb-8 px-6 border-t border-white/5">
        <div className="max-w-77xl mx-auto">
          <div className="grid md:grid-cols-12 gap-12 mb-12">
            <div className="md:col-span-4 lg:col-span-5">
              <Link to="/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center gap-2 mb-6">
                <div className="p-1.5 bg-accent-maroon rounded-lg">
                  <Heart className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-display font-black text-white tracking-tight">HeartSync</span>
              </Link>
              <p className="text-white/60 max-w-xs leading-relaxed font-medium text-sm">
                Advanced emergency synchronization protocol for the global healthcare infrastructure. Precision matters.
              </p>
            </div>
            <div className="md:col-span-2 lg:col-span-2">
               <h5 className="font-black text-white mb-5 uppercase text-[10px] tracking-widest">Network</h5>
               <ul className="space-y-3">
                 <li><a href="#home" onClick={(e) => { e.preventDefault(); document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-white/60 hover:text-accent-maroon transition-colors text-xs font-bold">Home</a></li>
                 <li><a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-white/60 hover:text-accent-maroon transition-colors text-xs font-bold">Features</a></li>
                 <li><a href="#about" onClick={(e) => { e.preventDefault(); document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-white/60 hover:text-accent-maroon transition-colors text-xs font-bold">About</a></li>
                 <li><a href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-white/60 hover:text-accent-maroon transition-colors text-xs font-bold">Contact</a></li>
               </ul>
            </div>
            <div className="md:col-span-2 lg:col-span-2">
               <h5 className="font-black text-white mb-5 uppercase text-[10px] tracking-widest">Compliance</h5>
               <ul className="space-y-3">
                 <li><a href="#" className="text-white/60 hover:text-accent-maroon transition-colors text-xs font-bold uppercase tracking-tighter">HIPAA/GDPR</a></li>
                 <li><a href="#" className="text-white/60 hover:text-accent-maroon transition-colors text-xs font-bold uppercase tracking-tighter">Data Privacy</a></li>
               </ul>
            </div>
            <div className="md:col-span-4 lg:col-span-3">
               <h5 className="font-black text-white mb-5 uppercase text-[10px] tracking-widest">Newsletter</h5>
               <div className="relative">
                 <input type="email" placeholder="node@sync.health" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder:text-white/30 focus:border-accent-maroon/50 outline-none transition-colors" />
                 <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-accent-maroon"><ArrowRight className="w-4 h-4" /></button>
               </div>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">© 2026 HeartSync Architecture. All rights reserved.</p>
            <div className="flex gap-8">
              {['Twitter', 'LinkedIn', 'Github'].map(s => <a key={s} href="#" className="text-[9px] font-black text-white/40 hover:text-accent-maroon transition-colors tracking-widest uppercase">{s}</a>)}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
