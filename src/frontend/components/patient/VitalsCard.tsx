import React from 'react';
import { LucideIcon, Activity } from 'lucide-react';
import { motion } from 'motion/react';

interface VitalsCardProps {
  label: string;
  value: string | number;
  unit: string;
  status: 'optimal' | 'warning' | 'critical';
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'stable';
  isEmergency?: boolean;
  customStatusLabel?: string;
}

const VitalsCard: React.FC<VitalsCardProps> = ({ 
  label, 
  value, 
  unit, 
  status, 
  icon: Icon, 
  trend, 
  isEmergency,
  customStatusLabel 
}) => {
  const isCritical = status === 'critical' || isEmergency;
  const isWarning = status === 'warning';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        borderColor: isCritical ? 'rgba(211, 47, 47, 0.3)' : isWarning ? 'rgba(245, 158, 11, 0.3)' : 'rgba(241, 245, 249, 1)',
      }}
      whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.05)' }}
      className={`p-6 md:p-8 rounded-[40px] border border-slate-100 bg-white relative overflow-hidden group transition-all duration-500 ${
        isCritical ? 'ring-4 ring-accent-maroon/5' : isWarning ? 'ring-4 ring-amber-500/5' : ''
      }`}
    >
      {/* Dynamic Background Glow */}
      <div className={`absolute -right-10 -top-10 w-32 h-32 blur-[60px] transition-all duration-1000 ${
        isCritical ? 'bg-accent-maroon/10' : isWarning ? 'bg-amber-500/10' : 'bg-slate-100/50 group-hover:bg-accent-maroon/5'
      }`} />
      
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-6">
          <div className={`p-4 rounded-2xl transition-all duration-500 ${
            isCritical ? 'bg-accent-maroon text-white shadow-lg shadow-accent-maroon/20' : 
            isWarning ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 
            'bg-slate-50 text-slate-400 group-hover:bg-accent-maroon group-hover:text-white group-hover:shadow-lg group-hover:shadow-accent-maroon/20'
          }`}>
            <Icon className={`w-6 h-6 ${isCritical ? 'animate-pulse' : ''}`} />
          </div>
          
          <div className="flex flex-col items-end gap-1">
            {isCritical ? (
              <div className="px-3 py-1 bg-accent-maroon text-white text-[9px] font-black uppercase tracking-widest rounded-full animate-bounce shadow-lg shadow-accent-maroon/20">
                Critical
              </div>
            ) : isWarning ? (
              <div className="px-3 py-1 bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-amber-500/20">
                Warning
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                 <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Live</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{label}</p>
          <div className="flex items-baseline gap-2">
            <h3 className={`font-black tracking-tighter italic transition-all duration-500 ${
              value.toString().length > 12 ? 'text-lg md:text-xl' :
              value.toString().length > 8 ? 'text-xl md:text-2xl' :
              value.toString().length > 5 ? 'text-2xl md:text-3xl' : 
              'text-4xl md:text-5xl'
            } ${
              isCritical ? 'text-accent-maroon' : isWarning ? 'text-amber-600' : 'text-slate-900'
            }`}>
              {value}
            </h3>
            {unit && <span className="text-sm font-black text-slate-300 uppercase italic tracking-wide">{unit}</span>}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <div className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-accent-maroon' : isWarning ? 'bg-amber-500' : 'bg-green-500'}`} />
             <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-wider md:tracking-widest truncate ${
               isCritical ? 'text-accent-maroon' : isWarning ? 'text-amber-600' : 'text-slate-400'
             }`}>
                {customStatusLabel || (isCritical ? 'Urgent' : isWarning ? 'Elevated Risk' : 'Optimal')}
             </span>
          </div>
          {trend && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
              trend === 'up' ? 'text-amber-600' : 'text-green-600'
            }`}>
              <span className="text-[9px] font-black uppercase">{trend}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default VitalsCard;
