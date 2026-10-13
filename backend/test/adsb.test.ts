import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aircraftList } from '../src/services/adsb';

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
