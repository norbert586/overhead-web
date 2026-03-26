import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSettings } from '../hooks/useSettings';

const NM_TO_M = 1852;

export default function MapCard() {
  const { settings } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);
  const circleRef    = useRef<L.Circle | null>(null);
  const markerRef    = useRef<L.CircleMarker | null>(null);

  const lat      = settings.latitude;
  const lon      = settings.longitude;
  const radiusNm = settings.radiusNm;

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || lat == null || lon == null) return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center:             [lat, lon],
      zoom:               10,
      zoomControl:        false,
      attributionControl: false,
      scrollWheelZoom:    false,
      dragging:           false,
      doubleClickZoom:    false,
      keyboard:           false,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', maxZoom: 19 },
    ).addTo(map);

    // Tiny attribution in corner
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('© <a href="https://carto.com/" target="_blank">CARTO</a>')
      .addTo(map);

    circleRef.current = L.circle([lat, lon], {
      radius:      radiusNm * NM_TO_M,
      color:       'rgba(126, 184, 224, 0.55)',
      fillColor:   'rgba(126, 184, 224, 0.06)',
      fillOpacity: 1,
      weight:      1,
    }).addTo(map);

    markerRef.current = L.circleMarker([lat, lon], {
      radius:      4,
      color:       '#7eb8e0',
      fillColor:   '#7eb8e0',
      fillOpacity: 0.9,
      weight:      0,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current  = null;
      circleRef.current  = null;
      markerRef.current  = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // init once; coord/radius changes handled below

  // Update circle + view when settings change
  useEffect(() => {
    if (!mapRef.current || lat == null || lon == null) return;
    const latlng = L.latLng(lat, lon);
    mapRef.current.setView(latlng, mapRef.current.getZoom(), { animate: false });
    circleRef.current?.setLatLng(latlng).setRadius(radiusNm * NM_TO_M);
    markerRef.current?.setLatLng(latlng);
  }, [lat, lon, radiusNm]);

  if (lat == null || lon == null) {
    return (
      <div className="map-card map-card-placeholder">
        <span className="map-no-location">No location set</span>
      </div>
    );
  }

  return <div ref={containerRef} className="map-card" />;
}
