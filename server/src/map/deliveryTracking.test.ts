import fs from 'fs';
import path from 'path';

describe('delivery tracking page route', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

  test('adds dedicated /delivery/:userId page without removing /map routes', () => {
    expect(indexSource).toContain("app.get('/delivery/:userId'");
    expect(indexSource).toContain("app.get(['/map', '/map/:userId']");
  });

  test('renders delivery top card and bottom trip drawer fields', () => {
    expect(indexSource).toContain('id="driverName"');
    expect(indexSource).toContain('id="onlineText"');
    expect(indexSource).toContain('id="accuracy"');
    expect(indexSource).toContain('id="speed"');
    expect(indexSource).toContain('id="battery"');
    expect(indexSource).toContain('id="tripKm"');
    expect(indexSource).toContain('id="startTime"');
    expect(indexSource).toContain('id="stops"');
    expect(indexSource).toContain('id="tripStatus"');
  });

  test('includes follow live mode and active route rendering', () => {
    expect(indexSource).toContain('let followLive = true');
    expect(indexSource).toContain("id=\"followBtn\"");
    expect(indexSource).toContain("id=\"centerBtn\"");
    expect(indexSource).toContain('function updateRoute(points)');
    expect(indexSource).toContain('fetchRoadLatLngs(roadPoints)');
    expect(indexSource).toContain('let routePoints = activeRoutePoints(points)');
    expect(indexSource).toContain('if (routePoints.length < 2) {');
    expect(indexSource).toContain("html: '<div style=\"width:36px;height:36px;background:#0ea5e9;");
    expect(indexSource).toContain('marker = L.marker(latLng, { icon: bikeIcon }).addTo(markerLayer)');
  });

  test('falls back to latest history point when live location is unavailable', () => {
    expect(indexSource).toContain('const liveLocation = (data.locations || []).find((item) => item.userId === userId)');
    expect(indexSource).toContain('const lastHistoryPoint = historyPoints.length ? historyPoints[historyPoints.length - 1] : null');
    expect(indexSource).toContain('const location = liveLocation || lastHistoryPoint');
  });
});
