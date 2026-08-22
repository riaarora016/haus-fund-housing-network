import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Property } from '../lib/types';
import { FRONTIER } from '../lib/types';
import { adjScore, fmtMoney } from '../lib/staleness';

const frontierIcon = L.divIcon({ className: '', html: '<div style="width:18px;height:18px;border-radius:4px;background:#0ea5e9;border:2px solid white;box-shadow:0 0 0 2px #0369a1;transform:rotate(45deg)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
const color = (s: number | null) => (s == null ? '#9ca3af' : s >= 80 ? '#10b981' : s >= 60 ? '#84cc16' : s >= 40 ? '#f59e0b' : '#9ca3af');

export function MapView({ rows, onSelect, selected }: { rows: Property[]; onSelect: (p: Property) => void; selected?: string }) {
  const pts = rows.filter((p) => p.lat != null && p.lng != null);
  return (
    <MapContainer center={[37.785, -122.41]} zoom={13} className="h-full w-full" preferCanvas>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[FRONTIER.lat, FRONTIER.lng]} icon={frontierIcon}><Tooltip permanent direction="right" offset={[10, 0]}>Frontier Tower · 995 Market</Tooltip></Marker>
      {pts.map((p) => { const s = adjScore(p); return (
        <CircleMarker key={p.id} center={[p.lat!, p.lng!]} radius={p.baseline ? 9 : p.geo_precision === 'neighborhood' ? 5 : 7} pathOptions={{ color: p.baseline ? '#0369a1' : selected === p.id ? '#000' : 'white', weight: selected === p.id ? 3 : 1, fillColor: p.baseline ? '#0ea5e9' : color(s), fillOpacity: p.geo_precision === 'neighborhood' ? 0.45 : 0.85, dashArray: p.geo_precision === 'neighborhood' ? '2 2' : undefined }} eventHandlers={{ click: () => onSelect(p) }}>
          <Tooltip><b>{p.name}</b><br />{p.neighborhood} · {p.type} · beds {p.beds_est ?? '?'} · {fmtMoney(p.price_per_bed_est)}/bed · score {s ?? '—'}{p.geo_precision === 'neighborhood' ? <><br /><i>approx. location (neighborhood centroid)</i></> : null}</Tooltip>
          <Popup><b>{p.name}</b><br />{p.address}<br /><button className="underline" onClick={() => onSelect(p)}>open</button></Popup>
        </CircleMarker>); })}
      <div className="leaflet-bottom leaflet-left"><div className="leaflet-control bg-white/90 dark:bg-neutral-900/90 rounded px-2 py-1 text-[11px]">score: <span style={{ color: '#10b981' }}>●</span>≥80 <span style={{ color: '#84cc16' }}>●</span>≥60 <span style={{ color: '#f59e0b' }}>●</span>≥40 <span style={{ color: '#9ca3af' }}>●</span>&lt;40 · dashed = approx. location · ◆ Frontier Tower</div></div>
    </MapContainer>
  );
}
