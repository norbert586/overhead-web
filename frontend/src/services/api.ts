// Overhead — API Service
// Wraps all calls to the Overhead backend.

import type { Flight, FlightsResponse } from '../types/flight';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export async function fetchFlights(
  lat: number,
  lon: number,
  radius: number,
): Promise<FlightsResponse> {
  const res = await fetch(`${BASE_URL}/api/flights?lat=${lat}&lon=${lon}&radius=${radius}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchLog(
  limit: number,
  offset = 0,
): Promise<{ flights: Flight[]; total: number }> {
  const res = await fetch(`${BASE_URL}/api/log?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
