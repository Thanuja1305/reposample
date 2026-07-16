import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Leaflet with React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to handle map view updates
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

interface Hospital {
  name: string;
  position: [number, number];
  type?: string;
}

interface Specialist {
  name: string;
  position: [number, number];
  specialization?: string;
}

interface LiveLocationMapProps {
  patientPosition: [number, number];
  hospitals?: Hospital[];
  cardiologists?: Specialist[];
  ambulancePosition?: [number, number];
  isEmergency?: boolean;
}

export default function LiveLocationMap({ 
  patientPosition, 
  hospitals = [], 
  cardiologists = [],
  ambulancePosition,
  isEmergency = false 
}: LiveLocationMapProps) {
  
  // Custom ambulance icon (Premium local SVG - 0ms load, works offline, no 404s)
  const ambulanceIcon = new L.DivIcon({
    className: 'custom-ambulance-div-icon',
    html: `
      <div class="w-10 h-10 bg-slate-900 border-2 border-amber-500 rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 animate-pulse">
          <rect x="1" y="3" width="15" height="13" rx="2" fill="#ffffff" />
          <polygon points="16 8 20 8 23 11 23 16 16 16" fill="#ffffff" stroke="#f59e0b" stroke-width="2" />
          <circle cx="5.5" cy="18.5" r="2.5" fill="#1e293b" />
          <circle cx="18.5" cy="18.5" r="2.5" fill="#1e293b" />
          <path d="M7 8h4M9 6v4" stroke="#dc2626" stroke-width="2"/>
        </svg>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });

  // Custom hospital icon (Premium local SVG - 0ms load, works offline, no 404s)
  const hospitalIcon = new L.DivIcon({
    className: 'custom-hospital-div-icon',
    html: `
      <div class="w-9 h-9 bg-red-50 border-2 border-red-500 rounded-xl flex items-center justify-center shadow-[0_4px_12px_rgba(220,38,38,0.25)]">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });

  // Custom specialist icon (Premium local SVG - 0ms load, works offline, no 404s)
  const specialistIcon = new L.DivIcon({
    className: 'custom-specialist-div-icon',
    html: `
      <div class="w-9 h-9 bg-blue-50 border-2 border-blue-500 rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(59,130,246,0.25)]">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });

  // Patient icon with pulse effect for emergency
  const patientIcon = new L.DivIcon({
    className: 'custom-div-icon',
    html: `
      <div class="relative flex items-center justify-center">
        <div class="absolute w-8 h-8 ${isEmergency ? 'bg-red-500 animate-ping' : 'bg-accent-maroon/20 animate-pulse'} rounded-full"></div>
        <div class="relative w-4 h-4 ${isEmergency ? 'bg-red-600' : 'bg-accent-maroon'} rounded-full border-2 border-white shadow-lg"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <div className={`w-full h-full rounded-[32px] overflow-hidden border-4 ${isEmergency ? 'border-red-600' : 'border-white'} shadow-2xl relative z-0 transition-all duration-1000`}>
      <MapContainer
        center={patientPosition}
        zoom={14}
        scrollWheelZoom={true}
        className="w-full h-full"
        zoomControl={false}
      >
        <ChangeView center={patientPosition} />
        
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {/* Patient Marker */}
        <Marker position={patientPosition} icon={patientIcon}>
          <Popup className="custom-popup">
            <div className="p-2 min-w-[150px]">
              <p className="font-black text-slate-900 uppercase tracking-widest text-[10px] mb-1">Patient Location</p>
              <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${isEmergency ? 'bg-red-600 animate-pulse' : 'bg-green-500'}`}></div>
                 <p className={`font-bold text-[10px] ${isEmergency ? 'text-red-600' : 'text-slate-500'}`}>
                    {isEmergency ? 'EMERGENCY PROTOCOL ACTIVE' : 'Status: Nominal'}
                 </p>
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Ambulance Marker */}
        {ambulancePosition && (
          <Marker position={ambulancePosition} icon={ambulanceIcon}>
            <Popup>
               <div className="p-1">
                  <p className="font-black text-slate-900 uppercase tracking-widest text-xs">Dispatch Unit 🚑</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">ETA: 4 Minutes</p>
               </div>
            </Popup>
          </Marker>
        )}

        {/* Hospital Markers */}
        {hospitals.map((hospital, idx) => (
          <Marker key={`hosp-${idx}`} position={hospital.position} icon={hospitalIcon}>
            <Popup>
               <div className="p-1">
                  <p className="font-black text-slate-900 uppercase tracking-widest text-xs">{hospital.name}</p>
                  <p className="text-[10px] text-slate-500">{hospital.type || 'Cardiac Center'}</p>
               </div>
            </Popup>
          </Marker>
        ))}

        {/* Specialist Markers */}
        {cardiologists.map((doc, idx) => (
          <Marker key={`doc-${idx}`} position={doc.position} icon={specialistIcon}>
            <Popup>
               <div className="p-1">
                  <p className="font-black text-slate-900 uppercase tracking-widest text-xs">{doc.name}</p>
                  <p className="text-[10px] text-accent-maroon font-bold uppercase tracking-tighter">{doc.specialization || 'Cardiologist'}</p>
               </div>
            </Popup>
          </Marker>
        ))}

      </MapContainer>
    </div>
  );
}
