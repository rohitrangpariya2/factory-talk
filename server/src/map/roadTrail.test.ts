import { buildRoadTrailScript } from './roadTrail';

describe('road trail script', () => {
  test('renders OSRM helpers for selected trip routes only', () => {
    const script = buildRoadTrailScript();

    expect(script).toContain('/road-route?coordinates=');
    expect(script).toContain('ROAD_ROUTE_MAX_POINTS = 35');
    expect(script).toContain('ROAD_ROUTE_MIN_DISTANCE_METERS = 50');
    expect(script).toContain('ROAD_ROUTE_MIN_TIME_MS = 90000');
    expect(script).toContain('ROAD_ROUTE_MAX_ACCURACY_METERS = 150');
    expect(script).toContain("Routes: OSRM");
    expect(script).toContain('function sampleRoadTrailPoints(points)');
    expect(script).toContain('async function fetchRoadLatLngs(points)');
    expect(script).not.toContain('function applyRoadTrail');
    expect(script).not.toContain('roadTrailState');
    expect(script).not.toContain('function isRoadTrailPrefix');
    expect(script).not.toContain('function roadTrailPointKey');
    expect(script).not.toContain('ROAD_ROUTE_MIN_INTERVAL_MS');
    expect(script).not.toContain('function roadTrailSignature');
  });
});
