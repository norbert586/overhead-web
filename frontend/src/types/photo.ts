// Aircraft photos as served by GET /api/photos (backend services/photos.ts).

/** Where the aircraft sits in the photo, as fractions of the image (0..1). */
export interface FocusBox { x: number; y: number; w: number; h: number }

export type PhotoProvider = 'planespotters' | 'airport-data' | 'wikimedia';

export interface PhotoCandidate {
  url: string;
  width: number | null;
  height: number | null;
  provider: PhotoProvider;
  /** 'exact': this very airframe. 'type': the same model — another airframe, or a reference photo. */
  match: 'exact' | 'type';
  /** The photo's own page. Planespotters requires the photo to link here. */
  link: string | null;
  photographer: string | null;
  license: string | null;
  /** For a stand-in from another airframe: its registration. */
  registration: string | null;
  /** Stand-in flown by the same airline (same livery). */
  sameAirline: boolean;
  focus: FocusBox | null;
}

export interface PhotoResult {
  /** Best first. The UI walks down the list when an image fails to load. */
  candidates: PhotoCandidate[];
  /** False when the server couldn't ask every airframe photo provider. */
  complete: boolean;
}
