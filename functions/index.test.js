import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedGeography } from './index.js';

test('normalizes canonical ISO subdivision returned by Google', () => {
  const result = normalizedGeography({
    place_id: 'place-1',
    address_components: [
      { long_name: 'Czechia', short_name: 'CZ', types: ['country'] },
      { long_name: 'Prague', short_name: 'CZ-10', types: ['administrative_area_level_1'] },
      { long_name: 'Prague', short_name: 'Prague', types: ['locality'] },
    ],
  }, 'u2fkbnh');
  assert.equal(result.countryCode, 'CZ');
  assert.equal(result.subdivisionCode, 'CZ-10');
  assert.equal(result.localityName, 'Prague');
});

test('does not promote a provider abbreviation to ISO', () => {
  const result = normalizedGeography({
    address_components: [
      { long_name: 'Example', short_name: 'EX', types: ['country'] },
      { long_name: 'North', short_name: 'N', types: ['administrative_area_level_1'] },
    ],
  }, 'abc1234');
  assert.equal(result.subdivisionCode, null);
  assert.equal(result.providerSubdivisionName, 'North');
});
