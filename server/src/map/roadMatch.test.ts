import {
  buildOsrmMatchUrl,
  buildRoadMatchFallback,
  parseOsrmMatchResponse,
  prepareRoadMatchPoints
} from './roadMatch';

describe('road match helpers', () => {
  test('pre-filters poor accuracy duplicates impossible jumps and samples safely', () => {
    const base = Date.parse('2026-06-02T06:00:00.000Z');
    const noisy = [
      { latitude: 21.259843, longitude: 72.938618, timestamp: base, accuracy: 12 },
      { latitude: 21.259843, longitude: 72.938618, timestamp: base + 1000, accuracy: 12 },
      { latitude: 21.260100, longitude: 72.938900, timestamp: base + 30000, accuracy: 18 },
      { latitude: 21.261000, longitude: 72.939600, timestamp: base + 60000, accuracy: 120 },
      { latitude: 22.500000, longitude: 73.900000, timestamp: base + 61000, accuracy: 15 },
      ...Array.from({ length: 80 }, (_, index) => ({
        latitude: 21.260200 + index * 0.0001,
        longitude: 72.939000 + index * 0.0001,
        timestamp: base + 90000 + index * 30000,
        accuracy: 20
      }))
    ];

    const points = prepareRoadMatchPoints(noisy);

    expect(points.length).toBeLessThanOrEqual(60);
    expect(points[0]).toMatchObject({ latitude: 21.259843, longitude: 72.938618 });
    expect(points.some((point) => point.accuracy === 120)).toBe(false);
    expect(points.some((point) => point.latitude === 22.5)).toBe(false);
    expect(points.filter((point) => point.latitude === 21.259843 && point.longitude === 72.938618)).toHaveLength(1);
  });

  test('builds OSRM match URL with lon lat timestamps and accuracy radiuses', () => {
    const url = buildOsrmMatchUrl([
      { latitude: 21.2598436, longitude: 72.9386185, timestamp: 1780380000000, accuracy: 12 },
      { latitude: 21.2601234, longitude: 72.9399876, timestamp: 1780380030000, accuracy: 18 }
    ]);

    expect(url).toBe(
      'https://router.project-osrm.org/match/v1/driving/72.938619,21.259844;72.939988,21.260123?overview=full&geometries=geojson&steps=false&annotations=false&gaps=split&timestamps=1780380000%3B1780380030&radiuses=12%3B18'
    );
  });

  test('parses OSRM matchings into latitude longitude coordinates', () => {
    const matched = parseOsrmMatchResponse({
      code: 'Ok',
      matchings: [
        {
          geometry: {
            coordinates: [
              [72.938618, 21.259843],
              [72.939000, 21.260000]
            ]
          }
        },
        {
          geometry: {
            coordinates: [[72.940000, 21.261000]]
          }
        }
      ]
    });

    expect(matched).toEqual([
      { latitude: 21.259843, longitude: 72.938618 },
      { latitude: 21.26, longitude: 72.939 },
      { latitude: 21.261, longitude: 72.94 }
    ]);
  });

  test('returns cleaned fallback coordinates when match data is empty', () => {
    const fallback = buildRoadMatchFallback(
      [
        { latitude: 21.259843, longitude: 72.938618, timestamp: 1780380000000, accuracy: 12 },
        { latitude: 21.260123, longitude: 72.939988, timestamp: 1780380030000, accuracy: 18 }
      ],
      'OSRM returned NoMatch'
    );

    expect(fallback).toEqual({
      status: 'fallback',
      reason: 'OSRM returned NoMatch',
      coordinates: [
        { latitude: 21.259843, longitude: 72.938618 },
        { latitude: 21.260123, longitude: 72.939988 }
      ]
    });
  });
});
