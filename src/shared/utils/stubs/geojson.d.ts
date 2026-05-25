declare module 'geojson' {
  export type BBox = [number, number, number, number] | [number, number, number, number, number, number]
  export interface Point { type: 'Point'; coordinates: [number, number] }
  export interface Polygon { type: 'Polygon'; coordinates: number[][][] }
  export interface MultiPoint { type: 'MultiPoint'; coordinates: [number, number][] }
  export interface GeoJsonProperties { [name: string]: unknown }
  export type Position = number[]
  export type Geometry = Point | Polygon | MultiPoint
}
