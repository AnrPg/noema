/**
 * Interactive Timezone Map Component
 *
 * SVG world map with:
 * - Snap-point markers at major timezone cities
 * - A vertical longitude line that follows mouse hover
 * - Snaps to nearest timezone city when cursor is close
 * - Click to select a timezone
 * - Current time preview for hovered/selected timezone
 */

'use client';

import { geoEqualEarth } from 'd3-geo';
import { Clock, MapPin } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Graticule, Marker } from 'react-simple-maps';
import { formatTimeInTimezone, TIMEZONE_CITIES, type TimezoneCity } from '../lib/timezone-data';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

/** Snap distance in pixels — how close cursor must be to snap to a city marker */
const SNAP_DISTANCE_PX = 30;

interface TimezoneMapProps {
  /** Currently selected timezone IANA id */
  value?: string;
  /** Called when user clicks a timezone city */
  onChange: (timezone: string) => void;
}

export function TimezoneMap({ value, onChange }: TimezoneMapProps) {
  const [hoveredCity, setHoveredCity] = useState<TimezoneCity | null>(null);
  const [cursorLng, setCursorLng] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Fixed projection for coordinate → pixel conversion
  const projection = useMemo(() => {
    return geoEqualEarth().scale(150).translate([400, 200]);
  }, []);

  /**
   * Convert mouse position on the SVG to geographic longitude.
   * Uses the projection's inverse to map pixels → [lng, lat].
   */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Scale SVG coordinates to viewBox
      const scaleX = 800 / rect.width;
      const scaleY = 400 / rect.height;
      const svgX = x * scaleX;
      const svgY = y * scaleY;

      // Convert pixel position to geographic coordinates
      const coords = projection.invert?.([svgX, svgY]);
      if (!coords) return;

      const lng = coords[0];
      setCursorLng(lng);

      // Find the nearest timezone city within snap distance
      let nearestCity: TimezoneCity | null = null;
      let nearestDist = Infinity;

      for (const city of TIMEZONE_CITIES) {
        const projected = projection([city.lng, city.lat]);
        if (!projected) continue;
        const dx = svgX - projected[0];
        const dy = svgY - projected[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < SNAP_DISTANCE_PX && dist < nearestDist) {
          nearestDist = dist;
          nearestCity = city;
        }
      }

      setHoveredCity(nearestCity);
    },
    [projection]
  );

  const handleMouseLeave = useCallback(() => {
    setCursorLng(null);
    setHoveredCity(null);
  }, []);

  const handleCityClick = useCallback(
    (timezone: string) => {
      onChange(timezone);
    },
    [onChange]
  );

  // Determine the line longitude: snap to hovered city or follow cursor
  const lineLng = hoveredCity ? hoveredCity.lng : cursorLng;

  // Build the vertical line path through the projection
  const verticalLinePath = useMemo(() => {
    if (lineLng === null) return null;
    const points: [number, number][] = [];
    for (let lat = -80; lat <= 80; lat += 2) {
      const projected = projection([lineLng, lat]);
      if (projected) {
        points.push([projected[0], projected[1]]);
      }
    }
    if (points.length < 2) return null;
    return 'M' + points.map((p) => `${p[0]},${p[1]}`).join('L');
  }, [lineLng, projection]);

  // Currently selected city
  const selectedCity = useMemo(
    () => TIMEZONE_CITIES.find((c) => c.timezone === value) ?? null,
    [value]
  );

  // What to show in the info bar
  const displayCity = hoveredCity ?? selectedCity;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border bg-muted/30">
        <svg
          ref={svgRef}
          viewBox="0 0 800 400"
          className="w-full h-auto cursor-crosshair select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <ComposableMap
            projection="geoEqualEarth"
            projectionConfig={{ scale: 150, center: [0, 0] }}
            width={800}
            height={400}
            style={{ width: '100%', height: 'auto' }}
          >
            {/* Grid lines */}
            <Graticule stroke="hsl(var(--muted-foreground) / 0.12)" strokeWidth={0.5} />

            {/* Land masses */}
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="hsl(var(--muted-foreground) / 0.15)"
                    stroke="hsl(var(--muted-foreground) / 0.25)"
                    strokeWidth={0.5}
                    style={{ outline: 'none' }}
                  />
                ))
              }
            </Geographies>

            {/* City snap-point markers */}
            {TIMEZONE_CITIES.map((city) => {
              const isSelected = value === city.timezone;
              const isHovered = hoveredCity?.timezone === city.timezone;

              return (
                <Marker
                  key={city.timezone}
                  coordinates={[city.lng, city.lat]}
                  onClick={() => {
                    handleCityClick(city.timezone);
                  }}
                >
                  {/* Outer glow ring for selected */}
                  {isSelected && (
                    <circle
                      r={8}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth={1.5}
                      opacity={0.5}
                      className="animate-pulse"
                    />
                  )}
                  {/* Main dot */}
                  <circle
                    r={isHovered || isSelected ? 5 : 3}
                    fill={
                      isSelected
                        ? 'hsl(var(--primary))'
                        : isHovered
                          ? 'hsl(var(--primary) / 0.8)'
                          : 'hsl(var(--muted-foreground) / 0.5)'
                    }
                    stroke={isHovered || isSelected ? 'hsl(var(--primary-foreground))' : 'none'}
                    strokeWidth={1}
                    className="transition-all duration-150 cursor-pointer"
                  />
                  {/* Label on hover/select */}
                  {(isHovered || isSelected) && (
                    <text
                      textAnchor="middle"
                      y={-10}
                      className="fill-foreground text-[10px] font-medium pointer-events-none"
                    >
                      {city.label}
                    </text>
                  )}
                </Marker>
              );
            })}
          </ComposableMap>

          {/* Vertical longitude line overlay */}
          {verticalLinePath && (
            <path
              d={verticalLinePath}
              stroke={
                hoveredCity ? 'hsl(var(--primary) / 0.6)' : 'hsl(var(--muted-foreground) / 0.3)'
              }
              strokeWidth={hoveredCity ? 1.5 : 1}
              strokeDasharray={hoveredCity ? 'none' : '4 4'}
              fill="none"
              className="pointer-events-none transition-all duration-100"
            />
          )}
        </svg>
      </div>

      {/* Info bar showing current/hovered timezone */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        {displayCity ? (
          <>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              <span className="font-medium text-foreground">{displayCity.label}</span>
              <span>({displayCity.utcOffset})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {formatTimeInTimezone(displayCity.timezone)}
            </span>
          </>
        ) : (
          <span>Hover over the map to preview timezones</span>
        )}
      </div>
    </div>
  );
}
