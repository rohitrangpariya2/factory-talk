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

  test('uses road matched distance for Today KM when available and keeps raw fallback', () => {
    expect(indexSource).toContain('const tripDistanceCache = new Map()');
    expect(indexSource).toContain('function rememberRoadDistance(routeCacheKey, roadLatLngs)');
    expect(indexSource).toContain('function roadMatchedDistanceForPoints(points)');
    expect(indexSource).toContain('function buildUserTripSummary(points)');
    expect(indexSource).toContain('const summary = buildUserTripSummary(sourcePoints)');
    expect(indexSource).toContain('distanceMeters: matchedDistance ?? distance');
    expect(indexSource).toContain("distanceSource: matchedDistance === null ? 'raw_gps' : 'road_matched'");
  });

  test('card Today KM and bottom trip summary use the same simplified trip source', () => {
    expect(indexSource).toContain('const userPoints = simplifyPoints(points');
    expect(indexSource).toContain('const summary = buildUserTripSummary(sourcePoints)');
    expect(indexSource).toContain('const summary = buildUserTripSummary(userPoints)');
    expect(indexSource).not.toContain('const trips = splitFactoryTrips(sourcePoints);');
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

  test('keeps live mode active after pressing live map button', () => {
    expect(indexSource).toContain('let forceLiveMapMode = false');
    expect(indexSource).toContain('if (selectedTripIndex < 0 && !forceLiveMapMode)');
    expect(indexSource).toContain('function showLiveMap()');
    expect(indexSource).toContain('forceLiveMapMode = true');
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
    expect(indexSource).toContain('const routeLines = segments.map(() => L.polyline([], {');
    expect(indexSource).toContain('setSelectedHistoryLineVisible(false)');
    expect(indexSource).toContain('routeLine.setLatLngs(roadLatLngs)');
    expect(indexSource).not.toContain('const routeLine = L.polyline(latLngs, {');
  });

  test('falls back to raw trip line when road matching fails', () => {
    expect(indexSource).toContain('routeLine.setLatLngs(segmentLatLngs)');
    expect(indexSource).toContain('.catch(() => {');
    expect(indexSource).toContain('if (selectedTripSignature === signature) routeLine.setLatLngs(segmentLatLngs);');
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
    expect(indexSource).toContain("const LIVE_TRAIL_OUTLINE_COLOR = '#ffffff'");
    expect(indexSource).toContain('historyLineCasings');
    expect(indexSource).toContain('function filterStablePoints(points)');
    expect(indexSource).toContain('function splitStableRouteSegments(points)');
    expect(indexSource).toContain('MAX_GPS_JUMP_SPEED_KMH = 95');
    expect(indexSource).toContain('ROUTE_SEGMENT_BREAK_SPEED_KMH = 75');
    expect(indexSource).toContain('MAX_GPS_JUMP_METERS = 260');
    expect(indexSource).toContain('function liveTrailPoints(points)');
    expect(indexSource).toContain('const stablePoints = filterStablePoints(points)');
    expect(indexSource).toContain('const trailPoints = liveTrailPoints(userPoints)');
    expect(indexSource).toContain('weight: 8');
    expect(indexSource).toContain('weight: 5');
    expect(indexSource).not.toContain('applyRoadTrail(key, trailPoints');
  });

  test('live blue route displays matched geometry with raw GPS fallback and debug metadata', () => {
    expect(indexSource).toContain('const liveRouteDebug = new Map()');
    expect(indexSource).toContain("routeSource: 'raw_gps'");
    expect(indexSource).toContain("routeSource: 'road_matched'");
    expect(indexSource).toContain('matchedGeometryPoints: roadLatLngs.length');
    expect(indexSource).toContain('rawGpsPoints: segmentPoints.length');
    expect(indexSource).toContain('lastMatchStatus: roadLatLngs.roadMatchStatus');
    expect(indexSource).toContain('window.__factoryTalkLiveRouteDebug');
    expect(indexSource).toContain('line.setLatLngs(nextLatLngs)');
    expect(indexSource).toContain('casing.setLatLngs(nextLatLngs)');
  });

  test('live route cache key changes when newer GPS points arrive', () => {
    expect(indexSource).toContain('function liveRouteCacheKey(points, fallbackKey)');
    expect(indexSource).toContain('Number(last.locationUpdatedAt || 0)');
    expect(indexSource).toContain('pointCount');
    expect(indexSource).toContain('const routeCacheKey = liveRouteCacheKey(roadPoints, key + ');
  });
});
