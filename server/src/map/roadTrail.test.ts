import { buildRoadTrailScript } from './roadTrail';

describe('road trail script', () => {
  test('renders a throttled OSRM road-following trail with attribution and fallback support', () => {
    const script = buildRoadTrailScript();

    expect(script).toContain('/road-route?coordinates=');
    expect(script).toContain('ROAD_ROUTE_MAX_POINTS = 25');
    expect(script).toContain('ROAD_ROUTE_MIN_INTERVAL_MS = 30000');
    expect(script).toContain("Routes: OSRM");
    expect(script).toContain('applyRoadTrail');
  });
});
