import { buildRoadTrailScript } from './roadTrail';

describe('road trail script', () => {
  test('renders OSRM helpers for selected trip routes only', () => {
    const script = buildRoadTrailScript();

    expect(script).toContain('/road-route?coordinates=');
    expect(script).toContain('ROAD_ROUTE_MAX_POINTS = 60');
    expect(script).toContain('ROAD_ROUTE_MIN_DISTANCE_METERS = 20');
    expect(script).toContain('ROAD_ROUTE_MIN_TIME_MS = 20000');
    expect(script).toContain('ROAD_ROUTE_MAX_ACCURACY_METERS = 30');
    expect(script).toContain("Routes: OSRM");
    expect(script).toContain('function sampleRoadTrailPoints(points)');
    expect(script).toContain('async function fetchRoadLatLngs(points)');
    expect(script).toContain("throw new Error('Road route failed (' + response.status + ')')");
    expect(script).toContain('data.routes && data.routes[0] && data.routes[0].geometry');
    expect(script).toContain('data.matchings && data.matchings.length');
    expect(script).not.toContain('function applyRoadTrail');
    expect(script).not.toContain('roadTrailState');
    expect(script).not.toContain('function isRoadTrailPrefix');
    expect(script).not.toContain('function roadTrailPointKey');
    expect(script).not.toContain('ROAD_ROUTE_MIN_INTERVAL_MS');
    expect(script).not.toContain('function roadTrailSignature');
  });
});
