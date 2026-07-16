import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom icons for medical nodes
const patientIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const ambulanceIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const doctorIcon = new L.Icon({
    iconUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=doctor&backgroundColor=b6e3f4',
    shadowUrl: iconShadow,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
});

const hospitalIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

interface Props {
  center: { lat: number, lng: number };
  patientPos: { lat: number, lng: number };
  ambulancePos?: { lat: number, lng: number };
  hospitals?: any[];
  doctors?: any[];
  zoom?: number;
}

const LeafletTracker: React.FC<Props> = ({ 
  center, 
  patientPos, 
  ambulancePos, 
  hospitals = [], 
  doctors = [], 
  zoom = 14 
}) => {
  return (
    <MapContainer 
      center={[center.lat, center.lng]} 
      zoom={zoom} 
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      {/* Patient Marker */}
      <Marker position={[patientPos.lat, patientPos.lng]} icon={patientIcon}>
        <Popup>Patient Node: Active Tracking</Popup>
      </Marker>

      {/* Ambulance Marker & Path */}
      {ambulancePos && (
        <>
          <Marker position={[ambulancePos.lat, ambulancePos.lng]} icon={ambulanceIcon}>
            <Popup>Emergency Unit: En Route</Popup>
          </Marker>
          <Polyline 
            positions={[[ambulancePos.lat, ambulancePos.lng], [patientPos.lat, patientPos.lng]]} 
            color="red" 
            weight={4}
            dashArray="10, 10"
          />
        </>
      )}

      {/* Doctors */}
      {doctors.map((d, i) => (
        d.position && (
          <Marker key={`doc-${i}`} position={[d.position[0], d.position[1]]} icon={doctorIcon}>
            <Popup>
              <div className="font-bold text-xs">{d.name}</div>
              <div className="text-[10px] text-slate-500">{d.specialization || 'Medical Specialist'}</div>
            </Popup>
          </Marker>
        )
      ))}

      {/* Hospitals */}
      {hospitals.map((h, i) => (
        h.position && (
          <Marker key={`hosp-${i}`} position={[h.position[0], h.position[1]]} icon={hospitalIcon}>
            <Popup>
              <div className="font-bold text-xs">{h.name}</div>
              <div className="text-[10px] text-slate-500">Medical Facility</div>
            </Popup>
          </Marker>
        )
      ))}
    </MapContainer>
  );
};

export default LeafletTracker;
