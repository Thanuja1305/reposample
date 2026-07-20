import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Volume2, VolumeX, X, MapPin, Eye, Phone, AlertCircle, Heart, Activity, Thermometer, Droplets } from 'lucide-react';

const ECGGraph = React.lazy(() => import('./patient/ECGGraph'));

interface DoctorEmergencyModalProps {
  activeEmergencyPatient: any;
  isMuted: boolean;
  onToggleMute: () => void;
  onClose: () => void;
  onIgnoreAlert: () => void;
  onConfirmCritical: () => void;
  onViewPatient: (patientId: string) => void;
  onCallAmbulance: () => void;
  isCallingAmbulance?: boolean;
}

const DoctorEmergencyModalComponent: React.FC<DoctorEmergencyModalProps> = ({
  activeEmergencyPatient,
  isMuted,
  onToggleMute,
  onClose,
  onIgnoreAlert,
  onConfirmCritical,
  onViewPatient,
  onCallAmbulance,
  isCallingAmbulance = false,
}) => {
  if (!activeEmergencyPatient) return null;

  const vitals = activeEmergencyPatient.vitals || {};
  const patient = activeEmergencyPatient.patient || {};
  const profile = patient.profile || {};

  const bpm = Number(vitals.bpm || vitals.heartRate || 0);
  const spo2 = Number(vitals.spo2 || 0);
  const temp = vitals.temperature_c || vitals.temp || '--';
  const humidity = vitals.humidity || '--';
  const ecgData = Array.isArray(vitals.ecg) ? vitals.ecg : [];

  const isBpmCritical = bpm > 0 && (bpm < 50 || bpm > 130);
  const isSpo2Critical = spo2 > 0 && spo2 < 90;
  const isTempCritical = temp !== '--' && (Number(temp) > 38 || Number(temp) < 35);

  const patientName = patient.fullName || profile.fullName || 'Unknown Patient';
  const patientId = patient.id || patient.serialNumber || 'HS-PATIENT';
  const age = profile.age || '--';
  const gender = profile.gender || 'Unspecified';
  const timestamp = vitals.timestamp ? new Date(vitals.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4"
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          style={{ width: 'min(90vw, 480px)', maxWidth: '480px', maxHeight: '80vh' }}
          className="bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col border border-red-200"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-700 to-red-900 p-4 sm:p-5 relative shrink-0 text-white">
            <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 z-20">
              <button
                onClick={onToggleMute}
                title={isMuted ? "Unmute Alarm" : "Mute Alarm"}
                className="text-white bg-black/20 hover:bg-white/20 transition-all p-1.5 rounded-full cursor-pointer active:scale-95"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={onClose}
                title="Dismiss Popup"
                className="text-white bg-black/20 hover:bg-red-950 transition-all p-1.5 rounded-full cursor-pointer active:scale-95"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3 relative z-10">
              <div className="w-9 h-9 bg-white/15 backdrop-blur-md rounded-xl flex items-center justify-center text-white shrink-0">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="px-2 py-0.5 bg-red-950/70 text-red-200 text-[8px] font-black uppercase tracking-widest rounded-full border border-red-400/30">
                    CRITICAL ALERT
                  </span>
                  <span className="text-[9px] font-medium text-red-200/90">{timestamp}</span>
                </div>
                <h2 className="text-white font-black text-sm tracking-tight truncate">
                  🚨 Critical Emergency Alert
                </h2>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-4 bg-white overflow-y-auto flex-1 flex flex-col gap-3">
            {/* Patient Info Bar */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-red-100 text-red-800 font-black flex items-center justify-center text-xs border border-red-200 shrink-0">
                  {patientName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 leading-tight">{patientName}</h3>
                  <p className="text-[9px] font-medium text-slate-500">
                    ID: {patientId.slice(0, 10)} • {gender} • {age} Yrs
                  </p>
                </div>
              </div>
            </div>

            {/* Live Critical Values Grid */}
            <div className="grid grid-cols-2 gap-2">
              {/* Heart Rate */}
              <div className={`p-2.5 rounded-xl border flex flex-col justify-between transition-colors ${
                isBpmCritical ? 'bg-red-50/90 border-red-200 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Heart className="w-2.5 h-2.5 text-red-500 fill-current" /> Heart Rate
                  </span>
                  <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded ${
                    isBpmCritical ? 'bg-red-200/90 text-red-900' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {isBpmCritical ? 'CRITICAL' : 'NORMAL'}
                  </span>
                </div>
                <p className="text-xl font-black tracking-tight">{bpm || '--'} <span className="text-[10px] font-bold opacity-75">BPM</span></p>
              </div>

              {/* SpO2 */}
              <div className={`p-2.5 rounded-xl border flex flex-col justify-between transition-colors ${
                isSpo2Critical ? 'bg-red-50/90 border-red-200 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Activity className="w-2.5 h-2.5 text-blue-500" /> SpO₂ Oxygen
                  </span>
                  <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded ${
                    isSpo2Critical ? 'bg-red-200/90 text-red-900' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {isSpo2Critical ? 'LOW SPO2' : 'NORMAL'}
                  </span>
                </div>
                <p className="text-xl font-black tracking-tight">{spo2 || '--'} <span className="text-[10px] font-bold opacity-75">%</span></p>
              </div>

              {/* Temperature */}
              <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                isTempCritical ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Thermometer className="w-2.5 h-2.5 text-amber-500" /> Temp
                  </span>
                </div>
                <p className="text-base font-black">{temp} <span className="text-[10px] font-bold opacity-75">°C</span></p>
              </div>

              {/* Humidity */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between text-slate-900">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Droplets className="w-2.5 h-2.5 text-cyan-500" /> Humidity
                  </span>
                </div>
                <p className="text-base font-black">{humidity} <span className="text-[10px] font-bold opacity-75">%</span></p>
              </div>
            </div>

            {/* ECG Live Waveform Preview */}
            <div className="border border-slate-200 rounded-xl overflow-hidden h-[85px] relative bg-white shadow-inner">
              <div className="absolute top-1.5 left-1.5 z-10 bg-slate-900/85 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm">
                <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" /> LIVE ECG WAVEFORM
              </div>
              <div className="pt-2 h-full w-[104%] -ml-[2%]">
                <React.Suspense fallback={
                  <div className="h-full w-full flex items-center justify-center bg-slate-50 text-[8px] font-bold text-slate-400">
                    Loading ECG Waveform...
                  </div>
                }>
                  <ECGGraph
                    bpm={bpm}
                    isEmergency={true}
                    ecgData={ecgData}
                    isSensorConnected={true}
                    isCritical={true}
                  />
                </React.Suspense>
              </div>
            </div>

            {/* AI Medical Assessment */}
            <div className="bg-red-50/60 border border-red-100 rounded-xl p-3">
              <p className="text-[8px] font-bold text-red-700 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                <Activity className="w-2.5 h-2.5" /> AI Clinical Assessment
              </p>
              <p className="text-[11px] text-slate-800 font-medium leading-tight">
                {vitals.aiDiagnosis?.summary || vitals.aiDiagnosis?.result || 'Critical biometric parameters detected. Immediate medical intervention required.'}
              </p>
            </div>
          </div>

          {/* Action Buttons Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-col gap-2 shrink-0">
            <button
              onClick={() => onViewPatient(patientId)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
            >
              <Eye className="w-3.5 h-3.5 text-white" /> View Patient Report
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onIgnoreAlert}
                className="flex-1 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
              >
                <AlertCircle className="w-3.5 h-3.5 text-slate-500" /> Ignore Alert
              </button>
              <button
                onClick={onConfirmCritical}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-red-600/20 active:scale-98"
              >
                <Phone className="w-3.5 h-3.5 fill-current" /> Call Emergency
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export const DoctorEmergencyModal = React.memo(DoctorEmergencyModalComponent);
export default DoctorEmergencyModal;
