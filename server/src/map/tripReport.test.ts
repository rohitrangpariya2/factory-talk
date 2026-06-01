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

  test('auto fits trip bounds only once so manual zoom is not overridden', () => {
    expect(indexSource).toContain('let shouldAutoFitTripBounds = true');
    expect(indexSource).toContain('if (bounds.isValid() && shouldAutoFitTripBounds)');
    expect(indexSource).toContain('shouldAutoFitTripBounds = false');
    expect(indexSource).toContain('function openTripOnMap(index)');
    expect(indexSource).toContain('shouldAutoFitTripBounds = true');
  });

  test('shows full trip history in the trip drawer', () => {
    expect(indexSource).toContain('currentTrips = trips');
    expect(indexSource).toContain('trips.map(renderTripCard).join');
    expect(indexSource).toContain('Aaj no trip summary');
  });

  test('marks holds only after two minutes away from the factory', () => {
    expect(indexSource).toContain('const STOP_MIN_DURATION_MS = 2 * 60 * 1000');
    expect(indexSource).toContain('duration >= STOP_MIN_DURATION_MS');
  });

  test('does not draw selected trip routes from raw GPS points', () => {
    expect(indexSource).toContain('function roadRouteCacheKey(points, fallbackKey)');
    expect(indexSource).toContain('function setSelectedHistoryLineVisible(visible)');
    expect(indexSource).toContain('const routeLine = L.polyline([], {');
    expect(indexSource).toContain('setSelectedHistoryLineVisible(false)');
    expect(indexSource).toContain('routeLine.setLatLngs(roadLatLngs)');
    expect(indexSource).not.toContain('const routeLine = L.polyline(latLngs, {');
  });

  test('falls back to raw trip line when road matching fails', () => {
    expect(indexSource).toContain('routeLine.setLatLngs(latLngs)');
    expect(indexSource).toContain('.catch(() => {');
    expect(indexSource).toContain('if (selectedTripSignature === signature) {');
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

  test('renders trip details in a collapsible bottom drawer', () => {
    expect(indexSource).toContain('class="panel trip-drawer collapsed"');
    expect(indexSource).toContain('id="tripDrawerHandle"');
    expect(indexSource).toContain('let tripDrawerExpanded = false');
    expect(indexSource).toContain('function setTripDrawerExpanded(expanded)');
    expect(indexSource).toContain('function updateTripDrawerChrome(title, subtitle)');
    expect(indexSource).toContain('timeline.classList.toggle');
  });

  test('keeps live route lines short so the map stays readable', () => {
    expect(indexSource).toContain('const LIVE_TRAIL_MAX_POINTS = 25');
    expect(indexSource).toContain('const LIVE_TRAIL_MAX_AGE_MS = 10 * 60 * 1000');
    expect(indexSource).toContain("const LIVE_TRAIL_COLOR = '#2563eb'");
    expect(indexSource).toContain('function liveTrailPoints(points)');
    expect(indexSource).toContain('const trailPoints = liveTrailPoints(userPoints)');
    expect(indexSource).toContain("dashArray: '2 8'");
    expect(indexSource).not.toContain('applyRoadTrail(key, trailPoints');
  });
});
