declare module 'react-simple-maps' {
  import type { ComponentType, SVGAttributes } from 'react';

  export interface ProjectionConfig {
    rotate?: [number, number, number];
    center?: [number, number];
    scale?: number;
  }

  export interface ComposableMapProps extends SVGAttributes<SVGSVGElement> {
    projection?: string;
    projectionConfig?: ProjectionConfig;
    width?: number;
    height?: number;
  }

  export interface GeographiesChildrenProps {
    geographies: GeographyType[];
    outline: object;
    borders: object;
  }

  export interface GeographiesProps {
    geography: string | object;
    children: (data: GeographiesChildrenProps) => React.ReactNode;
  }

  export interface GeographyType {
    rsmKey: string;
    properties: Record<string, unknown>;
    type: string;
    geometry: object;
  }

  export interface GeographyProps extends SVGAttributes<SVGPathElement> {
    geography: GeographyType;
  }

  export interface MarkerProps extends SVGAttributes<SVGGElement> {
    coordinates: [number, number];
  }

  export interface GraticuleProps extends SVGAttributes<SVGPathElement> {
    step?: [number, number];
  }

  export interface SphereProps extends SVGAttributes<SVGPathElement> {}

  export interface LineProps extends SVGAttributes<SVGPathElement> {
    from: [number, number];
    to: [number, number];
    coordinates?: [number, number][];
  }

  export interface ZoomableGroupProps extends SVGAttributes<SVGGElement> {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
  export const Marker: ComponentType<MarkerProps>;
  export const Graticule: ComponentType<GraticuleProps>;
  export const Sphere: ComponentType<SphereProps>;
  export const Line: ComponentType<LineProps>;
  export const ZoomableGroup: ComponentType<ZoomableGroupProps>;
}
