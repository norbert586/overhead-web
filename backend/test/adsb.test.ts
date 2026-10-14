import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aircraftList, bearingDeg } from '../src/services/adsb';

test('reads the readsb /v2 shape (ac)', () => {
  assert.deepEqual(aircraftList({ ac: [{ hex: 'a1' }], now: 1 }), [{ hex: 'a1' }]);
});

test('reads the adsb.fi opendata shape (aircraft)', () => {
  // Captured from the "unexpected response shape" error in production.
  assert.deepEqual(aircraftList({ now: 1791754514.001, aircraft: [{ hex: 'a12755', type: 'adsb_icao' }] }),
    [{ hex: 'a12755', type: 'adsb_icao' }]);
});

test('an empty sky is still a valid answer', () => {
  assert.deepEqual(aircraftList({ ac: [] }), []);
});

test('anything else is a failure, not an empty sky', () => {
  for (const bad of [null, 'html', 42, {}, { ac: 'x' }, { error: 'key required' }]) {
    assert.equal(aircraftList(bad), null);
  }
});

test('bearing from the catch point points the right way', () => {
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.5, `${a} vs ${b}`);
  near(bearingDeg(40, -74, 40.1, -74), 0);     // due north
  near(bearingDeg(40, -74, 40, -73.9), 90);    // due east (tiny offset: great circle ~ rhumb)
  near(bearingDeg(40, -74, 39.9, -74), 180);   // due south
  near(bearingDeg(40, -74, 40, -74.1), 270);   // due west
  near(bearingDeg(40, -74, 40.05, -73.935), 44.9); // northeast: lon degrees shrink by cos(lat)
});
