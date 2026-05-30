import { buildOsrmRouteUrl, normalizeRoadRouteCoordinates } from './roadRoute';

describe('road route proxy helpers', () => {
  test('normalizes valid lon,lat coordinates for OSRM', () => {
    const coordinates = normalizeRoadRouteCoordinates('72.9386185,21.2598436;72.8755772,21.2186101');

    expect(coordinates).toBe('72.938619,21.259844;72.875577,21.218610');
  });

  test('rejects invalid or too-large coordinate lists', () => {
    const tooMany = Array.from({ length: 26 }, (_, index) => `72.${index},21.${index}`).join(';');

    expect(normalizeRoadRouteCoordinates('72.1,21.1')).toBeNull();
    expect(normalizeRoadRouteCoordinates('bad')).toBeNull();
    expect(normalizeRoadRouteCoordinates(tooMany)).toBeNull();
  });

  test('builds a fixed OSRM driving route URL', () => {
    const url = buildOsrmRouteUrl('72.938619,21.259844;72.875577,21.218610');

    expect(url).toBe(
      'http://router.project-osrm.org/route/v1/driving/72.938619,21.259844;72.875577,21.218610?overview=full&geometries=geojson&steps=false&annotations=false'
    );
  });
});
