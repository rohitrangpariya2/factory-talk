import { FACTORY_ZONE, buildFactoryZoneScript } from './factoryZone';

describe('factory map zone', () => {
  test('uses the configured factory coordinates and 200 meter radius', () => {
    expect(FACTORY_ZONE.latitude).toBeCloseTo(21.259843683720433, 12);
    expect(FACTORY_ZONE.longitude).toBeCloseTo(72.9386185449755, 12);
    expect(FACTORY_ZONE.radiusMeters).toBe(200);
  });

  test('renders the factory radius circle on the Leaflet map', () => {
    const script = buildFactoryZoneScript();

    expect(script).toContain('Factory Zone');
    expect(script).toContain('radius: 200');
    expect(script).toContain('21.259843683720433');
    expect(script).toContain('72.9386185449755');
  });
});
