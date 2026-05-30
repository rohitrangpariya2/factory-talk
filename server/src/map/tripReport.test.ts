import fs from 'fs';
import path from 'path';

describe('factory trip report map script', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

  test('splits history into numbered factory trips with active trip support', () => {
    expect(indexSource).toContain('function splitFactoryTrips(points)');
    expect(indexSource).toContain("'Trip ' + (index + 1)");
    expect(indexSource).toContain('Active Trip');
    expect(indexSource).toContain('RETURN_CONFIRM_MS = 60 * 1000');
  });

  test('renders a daily trip count and total distance summary', () => {
    expect(indexSource).toContain('function buildTripSummary(trips)');
    expect(indexSource).toContain("reportBox('Total trips'");
    expect(indexSource).toContain("reportBox('Total km'");
    expect(indexSource).toContain("reportBox('Active trips'");
  });

  test('each trip card includes route and stop details with distance', () => {
    expect(indexSource).toContain('function renderTripRoutePoints(trip)');
    expect(indexSource).toContain('Route points');
    expect(indexSource).toContain("reportBox('Trip km'");
    expect(indexSource).toContain('Stops');
  });

  test('does not show avg or max speed in the trip report', () => {
    expect(indexSource).not.toContain("reportBox('Avg speed'");
    expect(indexSource).not.toContain("reportBox('Max speed'");
  });
});
