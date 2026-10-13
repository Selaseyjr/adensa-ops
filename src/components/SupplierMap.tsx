import { useEffect, useRef } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CATEGORY_COLORS } from '../lib/colors'
import { coordsFor } from '../lib/geo'
import { CATEGORY_LABELS, type Supplier } from '../types'

/**
 * Leaflet map of Ghana with one circle marker per supplier, coloured by
 * category. Coordinates are approximated from the area string in each
 * record (see lib/geo) — enough to show geographic spread, not for
 * navigation. Markers open a popup with the supplier's details.
 */
export function SupplierMap({
  suppliers,
  height = 360,
}: {
  suppliers: Supplier[]
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [6.2, -1.5], // roughly central Ghana
      zoom: 8,
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // Redraw markers when the supplier set changes.
  useEffect(() => {
    const layer = layerRef.current
    const map = mapRef.current
    if (!layer || !map) return

    layer.clearLayers()
    const points: L.LatLngExpression[] = []

    suppliers.forEach((s) => {
      const { lat, lng } = coordsFor(s.location, s.city, s.id)
      points.push([lat, lng])

      const color = CATEGORY_COLORS[s.category]
      const marker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95,
      })

      marker.bindPopup(
        `
        <div style="min-width: 180px">
          <div style="font-weight: 600; color: #0f172a">${escapeHtml(s.name)}</div>
          <div style="color: ${color}; font-size: 11px; margin-top: 2px">${CATEGORY_LABELS[s.category]}</div>
          <div style="color: #64748b; margin-top: 6px">${escapeHtml(s.location)}${s.city ? `, ${escapeHtml(s.city)}` : ''}</div>
          ${s.phone || s.whatsapp ? `<div style="color: #64748b; margin-top: 2px">${escapeHtml(s.phone ?? s.whatsapp ?? '')}</div>` : ''}
          <div style="margin-top: 6px; text-transform: capitalize; color: #334155; font-size: 11px">Status: ${s.status}</div>
        </div>
        `,
      )
      layer.addLayer(marker)
    })

    // Fit view to markers when there are any, without padding-jumping on every render.
    if (points.length > 0) {
      const bounds = L.latLngBounds(points)
      map.fitBounds(bounds.pad(0.25), { maxZoom: 11, animate: false })
    }
  }, [suppliers])

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="overflow-hidden rounded-xl border border-slate-200"
      role="img"
      aria-label="Map of supplier locations across Ghana"
    />
  )
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
