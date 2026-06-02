import { FACTORY_ZONE, buildFactoryZoneScript } from './factoryZone';

describe('factory map zone', () => {
  test('uses the configured factory coordinates and 20 meter radius', () => {
    expect(FACTORY_ZONE.latitude).toBeCloseTo(21.259843683720433, 12);
    expect(FACTORY_ZONE.longitude).toBeCloseTo(72.9386185449755, 12);
    expect(FACTORY_ZONE.radiusMeters).toBe(20);
  });

  test('renders the factory radius circle on the Leaflet map', () => {
    const script = buildFactoryZoneScript();

    expect(script).toContain('Factory Zone');
    expect(script).toContain('fallbackFactoryZone');
    expect(script).toContain('radiusMeters: 20');
    expect(script).toContain('21.259843683720433');
    expect(script).toContain('72.9386185449755');
  });

  test('loads dynamic geofence config and keeps static factory zone as fallback', () => {
    const script = buildFactoryZoneScript();

    expect(script).toContain("fetch('/geofence-config'");
    expect(script).toContain('factoryZone = { ...fallbackFactoryZone }');
    expect(script).toContain('factoryZoneCircle.setRadius(factoryZone.radiusMeters)');
    expect(script).toContain('factoryZoneCenterMarker.setLatLng(factoryLatLng)');
  });
});
