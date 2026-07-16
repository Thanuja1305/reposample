import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { onSnapshot, collection, query, where, limit } from 'firebase/firestore';
import { db } from '../../shared/lib/firebase';
import { Volume2, VolumeX, AlertTriangle } from 'lucide-react';

// Synthesized Offline Web Audio API Siren (bulletproof, works offline, no network calls)
class WebAudioSiren {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private timer: any = null;

  start() {
    if (this.ctx) return;
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      this.ctx = new AudioContextClass();
      this.osc = this.ctx.createOscillator();
      this.gain = this.ctx.createGain();

      this.osc.type = 'sawtooth';
      this.osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      this.gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      
      this.osc.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      this.osc.start();

      let high = true;
      this.timer = setInterval(() => {
        if (!this.ctx || !this.osc) return;
        const targetFreq = high ? 600 : 900;
        try {
          this.osc.frequency.cancelScheduledValues(this.ctx.currentTime);
          this.osc.frequency.setValueAtTime(this.osc.frequency.value, this.ctx.currentTime);
          this.osc.frequency.linearRampToValueAtTime(targetFreq, this.ctx.currentTime + 0.4);
        } catch (err) {}
        high = !high;
      }, 450);
    } catch (e) {
      console.warn("Failed to start Web Audio Siren:", e);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      if (this.osc) {
        this.osc.stop();
        this.osc.disconnect();
        this.osc = null;
      }
      if (this.gain) {
        this.gain.disconnect();
        this.gain = null;
      }
      if (this.ctx) {
        if (this.ctx.state !== 'closed') {
          this.ctx.close();
        }
        this.ctx = null;
      }
    } catch (e) {
      // Ignore stop errors
    }
  }
}

const sirenSynth = new WebAudioSiren();

const EmergencySiren = () => {
  const location = useLocation();
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!location.pathname.includes('/doctor')) {
      setActiveAlerts([]);
      return;
    }

    // Listen for any active emergency alerts that are PENDING
    const q = query(
      collection(db, 'emergencyAlerts'),
      where('status', '==', 'PENDING'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveAlerts(alerts);
    });

    return () => unsubscribe();
  }, [location.pathname]);

  const [hasInteracted, setHasInteracted] = useState(false);
  
  useEffect(() => {
    const handleInteraction = () => {
      setHasInteracted(true);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (activeAlerts.length > 0 && !isMuted && hasInteracted && location.pathname.includes('/doctor')) {
      sirenSynth.start();
    } else {
      sirenSynth.stop();
    }
    return () => {
      sirenSynth.stop();
    };
  }, [activeAlerts, isMuted, hasInteracted, location.pathname]);


  // Only show on doctor portal
  if (!location.pathname.includes('/doctor')) return null;

  if (activeAlerts.length === 0) return null;

  return (
    <div className="fixed top-24 right-6 z-[9999] animate-bounce">
      <div className="bg-medical-red text-white px-6 py-4 rounded-[24px] shadow-[0_20px_50px_rgba(220,38,38,0.3)] flex items-center gap-4 border-2 border-white/20 backdrop-blur-md">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Active Emergency</p>
          <p className="text-sm font-black tracking-tight">{activeAlerts.length} Protocol(s) Active</p>
        </div>
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="ml-2 p-2 hover:bg-white/10 rounded-xl transition-colors"
          title={isMuted ? "Unmute Siren" : "Mute Siren"}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

export default EmergencySiren;
