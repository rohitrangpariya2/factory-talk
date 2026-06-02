import fs from 'fs';
import path from 'path';

describe('factory route deviation map script', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

  test('contains mathematical geometry helpers for deviation calculations', () => {
    expect(indexSource).toContain('function distanceMetersLatLng(a, b)');
    expect(indexSource).toContain('function distanceToPolyline(point, polyline)');
  });

  test('queries OSRM route API using only key waypoints for the suggested path', () => {
    expect(indexSource).toContain('function getTripKeyWaypoints(trip)');
    expect(indexSource).toContain('function fetchSuggestedRoute(waypoints)');
    expect(indexSource).toContain('activeTripSuggestedCache');
  });

  test('contains detour warning banner and card indicator UI blocks', () => {
    expect(indexSource).toContain('id="deviationAlertBanner"');
    expect(indexSource).toContain('class="deviation-banner"');
    expect(indexSource).toContain('function showDeviationBanner(');
    expect(indexSource).toContain('id="deviation-box-');
    expect(indexSource).toContain('function updateDeviationUI(');
  });

  test('highlights deviated segments on Leaflet route polylines', () => {
    expect(indexSource).toContain("color: subLine.deviated ? '#ef4444' : '#1d9bf0'"); // red detour segment color condition
    expect(indexSource).toContain('pointDeviated = devDist > 150'); // 150m threshold
  });
});
