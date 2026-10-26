import type { DimensionSource, Dimensions } from '../building-model';

// Every number the geometry reader produces says where it came from, so takeoffs and estimates can show
// which quantities rest on verified sizes and which on sample, AI-inferred or contractor-entered ones.

export type Unit = 'in' | 'sq in' | 'cu in' | 'count' | 'ratio' | 'deg';

export interface Measured {
  value: number;
  unit: Unit;
  verified: boolean;          // true only when every size it was computed from is verified
  source: DimensionSource;    // the weakest source among its inputs (sample < ai-inferred < contractor < blueprint)
  from: string[];             // element ids it was computed from
  ref?: Dimensions['ref'];    // the drawing reference when there is exactly one
}

export interface WallReading {
  id: string; name: string; floor: string; exterior: boolean; face: string | null;
  length: Measured;                 // centerline
  outsideLength: Measured;          // exterior face, corners included (centerline + thickness) for exterior walls
  height: Measured;
  thickness: Measured;
  grossArea: Measured;              // centerline length × height
  openingArea: Measured;
  netArea: Measured;                // gross − openings (one face, centerline)
  exteriorFaceArea: Measured | null;  // outside face net of openings (siding, sheathing, house wrap)
  interiorFaceArea: Measured;       // inside face net of openings; both faces for interior walls are reported separately
  openings: string[];
  rooms: string[];
  direction: [number, number];
}

export interface OpeningReading {
  id: string; name: string; kind: 'window' | 'door'; wall: string; floor: string; face: string | null; exterior: boolean;
  width: Measured; height: Measured; sill: Measured; head: Measured;
  area: Measured;
  trimPerimeter: Measured;          // casing length, one side: 2·h + w for doors, 2·(w + h) for windows
  center: [number, number, number]; // world position of the opening's center
}

export interface RoomReading {
  id: string; name: string; type: string; floor: string;
  area: Measured;
  perimeter: Measured;
  width: Measured; depth: Measured;
  ceilingHeight: Measured;
  wallSurfaceGross: Measured;       // perimeter × ceiling height
  openingArea: Measured;            // openings in this room's walls (counted once per room side)
  wallSurfaceNet: Measured;
  walls: string[];
  openings: string[];
  floorFinish: string;
}

export interface RoofReading {
  id: string; name: string; floor: string; material: string;
  pitch: Measured;                  // rise per 12 of run
  angle: Measured;                  // degrees
  pitchFactor: Measured;            // slope length / run
  rise: Measured; run: Measured;
  ridgeHeight: Measured;            // top of roof above floor 0
  ridgeLength: Measured;            // with overhangs
  rafterLength: Measured;           // eave to ridge along the slope, with overhang
  planArea: Measured;               // horizontal projection, with overhangs
  surfaceArea: Measured;            // both slopes
  eaveLength: Measured;             // both eaves
  rakeLength: Measured;             // four rake edges
  squares: Measured;                // surface area / 100 sq ft
}

export interface ComponentReading {
  id: string; name: string; kind: string; floor: string; room: string | null; material: string;
  width: Measured; depth: Measured; height: Measured;
  topArea: Measured;
  volume: Measured;
  frontLength: Measured;            // the longer plan side: cabinet and counter run length
}

export interface FloorReading {
  id: string; name: string; level: number;
  elevation: Measured; wallHeight: Measured; ceilingHeight: Measured;
  footprintArea: Measured;          // area inside the exterior wall centerlines
  exteriorPerimeter: Measured;      // centerline
  roomArea: Measured;
  exteriorWallLength: Measured; interiorWallLength: Measured;
}

export interface GeometryReading {
  model: { id: string; name: string; source: string };
  floors: FloorReading[];
  walls: WallReading[];
  openings: OpeningReading[];
  rooms: RoomReading[];
  roofs: RoofReading[];
  components: ComponentReading[];
  building: {
    floors: number;
    footprintWidth: Measured; footprintDepth: Measured;
    totalRoomArea: Measured;
    height: Measured;
    windowCount: Measured; doorCount: Measured;
  };
  unverified: { id: string; name: string; source: DimensionSource }[];
  warnings: string[];
}
