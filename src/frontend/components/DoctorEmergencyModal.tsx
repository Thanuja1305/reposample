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
  const timestamp = vitals.timestamp ? new Date(vitals.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 lg:p-6"
      >
        <motion.div
          initial={{ scale: 0.95, y: 15 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-[28px] shadow-2xl w-full max-w-[480px] overflow-hidden flex flex-col max-h-[90vh] border border-red-200"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-700 via-red-800 to-red-900 p-5 pt-6 pb-7 relative shrink-0 text-white">
            <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
              <button
                onClick={onToggleMute}
                title={isMuted ? "Unmute Alarm" : "Mute Alarm"}
                className="text-white bg-black/25 hover:bg-white/20 transition-all p-2 rounded-full shadow-sm cursor-pointer active:scale-95"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                onClick={onClose}
                title="Dismiss Popup"
                className="text-white bg-black/25 hover:bg-red-950 transition-all p-2 rounded-full shadow-sm cursor-pointer active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3.5 relative z-10">
              <div className="w-11 h-11 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center text-white shrink-0 shadow-inner">
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="px-2 py-0.5 bg-red-950/60 text-red-200 text-[9px] font-black uppercase tracking-widest rounded-full border border-red-500/30">
                    CRITICAL ALERT
                  </span>
                  <span className="text-[10px] font-medium text-red-200/90">{timestamp}</span>
                </div>
                <h2 className="text-white font-black text-base tracking-tight truncate">
                  🚨 Emergency Cardiac Event
                </h2>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 pt-5 bg-white overflow-y-auto flex-1 flex flex-col gap-4">
            {/* Patient Info Bar */}
            <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-800 font-black flex items-center justify-center text-sm border border-red-200 shrink-0">
                  {patientName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">{patientName}</h3>
                  <p className="text-[10px] font-medium text-slate-500">
                    ID: {patientId.slice(0, 10)} • {gender} • {age} Yrs
                  </p>
                </div>
              </div>
              <button
                onClick={() => onViewPatient(patientId)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold rounded-xl transition-colors shadow-sm shrink-0"
              >
                <Eye className="w-3 h-3" /> View Patient
              </button>
            </div>

            {/* Live Critical Values Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Heart Rate */}
              <div className={`p-3.5 rounded-2xl border flex flex-col justify-between transition-colors ${
                isBpmCritical ? 'bg-red-50/90 border-red-200 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Heart className="w-3 h-3 text-red-500 fill-current" /> Heart Rate
                  </span>
                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                    isBpmCritical ? 'bg-red-200/80 text-red-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {isBpmCritical ? 'CRITICAL' : 'NORMAL'}
                  </span>
                </div>
                <p className="text-2xl font-black tracking-tight">{bpm || '--'} <span className="text-xs font-bold opacity-75">BPM</span></p>
              </div>

              {/* SpO2 */}
              <div className={`p-3.5 rounded-2xl border flex flex-col justify-between transition-colors ${
                isSpo2Critical ? 'bg-red-50/90 border-red-200 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-blue-500" /> SpO₂ Oxygen
                  </span>
                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                    isSpo2Critical ? 'bg-red-200/80 text-red-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {isSpo2Critical ? 'LOW SPO2' : 'NORMAL'}
                  </span>
                </div>
                <p className="text-2xl font-black tracking-tight">{spo2 || '--'} <span className="text-xs font-bold opacity-75">%</span></p>
              </div>

              {/* Temperature */}
              <div className={`p-3 rounded-2xl border flex flex-col justify-between ${
                isTempCritical ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Thermometer className="w-3 h-3 text-amber-500" /> Temp
                  </span>
                </div>
                <p className="text-lg font-black">{temp} <span className="text-xs font-bold opacity-75">°C</span></p>
              </div>

              {/* Humidity */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between text-slate-900">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Droplets className="w-3 h-3 text-cyan-500" /> Humidity
                  </span>
                </div>
                <p className="text-lg font-black">{humidity} <span className="text-xs font-bold opacity-75">%</span></p>
              </div>
            </div>

            {/* ECG Live Waveform Preview */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden h-[105px] relative bg-white shadow-inner">
              <div className="absolute top-2 left-2 z-10 bg-slate-900/85 text-white text-[8px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE ECG WAVEFORM
              </div>
              <div className="pt-3 h-full w-[104%] -ml-[2%]">
                <React.Suspense fallback={
                  <div className="h-full w-full flex items-center justify-center bg-slate-50 text-[9px] font-bold text-slate-400">
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
            <div className="bg-red-50/60 border border-red-100 rounded-2xl p-3.5">
              <p className="text-[9px] font-bold text-red-700 uppercase tracking-widest mb-1 flex items-center gap-1">
                <Activity className="w-3 h-3" /> AI Clinical Assessment
              </p>
              <p className="text-xs text-slate-800 font-medium leading-relaxed">
                {vitals.aiDiagnosis?.summary || vitals.aiDiagnosis?.result || 'Critical biometric parameters detected. Immediate medical intervention required.'}
              </p>
            </div>

            {/* Location Status */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">GPS Telemetry Locked</p>
                  <p className="text-[9px] text-slate-500 font-medium">Ready for dispatch routing</p>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded-full">
                ONLINE
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2 shrink-0">
            <button
              onClick={onIgnoreAlert}
              className="flex-1 py-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
            >
              <AlertCircle className="w-3.5 h-3.5 text-slate-500" /> Ignore
            </button>
            <button
              onClick={() => onViewPatient(patientId)}
              className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95"
            >
              <Eye className="w-3.5 h-3.5 text-white" /> View Patient
            </button>
            <button
              onClick={onConfirmCritical}
              className="flex-[1.2] py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-red-600/30 active:scale-95"
            >
              <Phone className="w-3.5 h-3.5 fill-current" /> Call Emergency
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export const DoctorEmergencyModal = React.memo(DoctorEmergencyModalComponent);
export default DoctorEmergencyModal;
