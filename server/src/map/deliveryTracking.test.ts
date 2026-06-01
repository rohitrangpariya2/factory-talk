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
  });
});
