import { buildRoadTrailScript } from './roadTrail';

describe('road trail script', () => {
  test('renders OSRM map matching helpers with raw fallback', () => {
    const script = buildRoadTrailScript();

    expect(script).toContain('/road-match');
    expect(script).toContain('ROAD_MATCH_MAX_POINTS = 60');
    expect(script).toContain('ROAD_MATCH_MIN_DISTANCE_METERS = 20');
    expect(script).toContain('ROAD_MATCH_MIN_TIME_MS = 20000');
    expect(script).toContain('ROAD_MATCH_MAX_ACCURACY_METERS = 50');
    expect(script).toContain('ROAD_MATCH_MIN_INTERVAL_MS = 12000');
    expect(script).toContain("Routes: OSRM");
    expect(script).toContain('function sampleRoadTrailPoints(points)');
    expect(script).toContain('async function fetchRoadLatLngs(points)');
    expect(script).toContain('function buildRoadMatchPayload(points)');
    expect(script).toContain("method: 'POST'");
    expect(script).toContain("data.status === 'matched'");
    expect(script).toContain("data.status === 'fallback'");
    expect(script).toContain('roadLatLngs.roadDistanceMeters = Number(data.distanceMeters)');
    expect(script).toContain("throw new Error('Road match failed (' + response.status + ')')");
    expect(script).not.toContain('function isRoadTrailPrefix');
    expect(script).not.toContain('function roadTrailPointKey');
    expect(script).not.toContain('function roadTrailSignature');
  });
});
