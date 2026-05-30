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

  test('renders simple trip cards that can open each trip on the map', () => {
    expect(indexSource).toContain('function openTripOnMap(index)');
    expect(indexSource).toContain('function drawTripOnMap(trip, index)');
    expect(indexSource).toContain('function showLiveMap()');
    expect(indexSource).toContain('const tripRouteCache = new Map()');
    expect(indexSource).toContain('Aaj ni trips');
    expect(indexSource).toContain('Map ma kholo');
    expect(indexSource).toContain("reportBox('Trip km'");
    expect(indexSource).toContain("reportBox('Stops'");
  });

  test('does not show avg or max speed in the trip report', () => {
    expect(indexSource).not.toContain("reportBox('Avg speed'");
    expect(indexSource).not.toContain("reportBox('Max speed'");
  });

  test('uses server receive time for live location freshness', () => {
    expect(indexSource).toContain('function freshnessMs(location)');
    expect(indexSource).toContain('Number(location.receivedAt || location.locationUpdatedAt || 0)');
    expect(indexSource).toContain('if (freshnessMs(location) > 120000)');
  });
});
