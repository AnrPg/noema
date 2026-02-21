declare module 'react-simple-maps' {
  import type { ComponentType, SVGAttributes } from 'react';

  export interface IProjectionConfig {
    rotate?: [number, number, number];
    center?: [number, number];
    scale?: number;
  }

  export interface IComposableMapProps extends SVGAttributes<SVGSVGElement> {
    projection?: string;
    projectionConfig?: IProjectionConfig;
    width?: number;
    height?: number;
  }

  export interface IGeographiesChildrenProps {
    geographies: IGeographyType[];
    outline: object;
    borders: object;
  }

  export interface IGeographiesProps {
    geography: string | object;
    children: (data: IGeographiesChildrenProps) => React.ReactNode;
  }

  export interface IGeographyType {
    rsmKey: string;
    properties: Record<string, unknown>;
    type: string;
    geometry: object;
  }

  export interface IGeographyProps extends SVGAttributes<SVGPathElement> {
    geography: IGeographyType;
  }

  export interface IMarkerProps extends SVGAttributes<SVGGElement> {
    coordinates: [number, number];
  }

  export interface IGraticuleProps extends SVGAttributes<SVGPathElement> {
    step?: [number, number];
  }

  export type ISphereProps = SVGAttributes<SVGPathElement>;

  export interface ILineProps extends SVGAttributes<SVGPathElement> {
    from: [number, number];
    to: [number, number];
    coordinates?: [number, number][];
  }

  export interface IZoomableGroupProps extends SVGAttributes<SVGGElement> {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
  }

  export const ComposableMap: ComponentType<IComposableMapProps>;
  export const Geographies: ComponentType<IGeographiesProps>;
  export const Geography: ComponentType<IGeographyProps>;
  export const Marker: ComponentType<IMarkerProps>;
  export const Graticule: ComponentType<IGraticuleProps>;
  export const Sphere: ComponentType<ISphereProps>;
  export const Line: ComponentType<ILineProps>;
  export const ZoomableGroup: ComponentType<IZoomableGroupProps>;
}
