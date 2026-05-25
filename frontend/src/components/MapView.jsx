import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const createIcon = (emoji, color = '#dc2626') => L.divIcon({
  html: `<div style="background:${color};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid rgba(255,255,255,0.8);box-shadow:0 4px 12px rgba(0,0,0,0.4)">${emoji}</div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
});

export const ICONS = {
  user: createIcon('👤', '#3b82f6'),
  accident: createIcon('🚨', '#dc2626'),
  hospital: createIcon('🏥', '#16a34a'),
  ambulance: createIcon('🚑', '#2563eb'),
  police: createIcon('👮', '#7c3aed'),
  mechanic: createIcon('🔧', '#d97706'),
  insurance: createIcon('🛡️', '#0891b2'),
};

export default function MapView({ height = '500px', center = [19.076, 72.8777], zoom = 12, markers = [], circles = [], onMapClick, recenterLabel = 'Locate me' }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  // Observe theme changes on HTML tag
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(currentTheme);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { center, zoom, zoomControl: true });
    if (onMapClick) map.on('click', (e) => onMapClick(e.latlng));
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !Array.isArray(center) || center.length !== 2) return;
    const [lat, lng] = center;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView(center, zoom);
    }
  }, [center, zoom]);

  const returnToCurrentLocation = (event) => {
    event.stopPropagation();
    const map = mapInstanceRef.current;
    if (!map || !Array.isArray(center) || center.length !== 2) return;

    const [lat, lng] = center;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView(center, zoom);
    }
  };

  // Sync Tiles to Theme
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    const tileUrl = theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19,
    }).addTo(map);
  }, [theme]);

  // Update markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = markers.map(({ lat, lng, icon, popup, draggable }) => {
      const m = L.marker([lat, lng], { icon: icon || L.Icon.Default, draggable: !!draggable }).addTo(map);
      if (popup) m.bindPopup(popup);
      return m;
    });
  }, [markers]);

  // Update circles (radius visualization)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    circlesRef.current.forEach(c => c.remove());
    circlesRef.current = circles.map(({ lat, lng, radius, color, label }) => {
      const c = L.circle([lat, lng], {
        radius: radius * 1000, // km to meters
        color: color || '#ef4444',
        fillColor: color || '#ef4444',
        fillOpacity: 0.05,
        weight: 1.5,
        dashArray: '6,4',
      }).addTo(map);
      if (label) c.bindTooltip(label, { permanent: true, direction: 'top', className: 'leaflet-tooltip-dark' });
      return c;
    });
  }, [circles]);

  return (
    <div className="map-container" style={{ height }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      <button
        type="button"
        className="map-current-location-btn"
        onClick={returnToCurrentLocation}
        title={`Return to ${recenterLabel.toLowerCase()}`}
        aria-label={`Return to ${recenterLabel.toLowerCase()}`}
      >
        {recenterLabel}
      </button>
    </div>
  );
}
