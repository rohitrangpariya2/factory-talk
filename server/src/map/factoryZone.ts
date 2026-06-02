export type FactoryZone = {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export const FACTORY_ZONE: FactoryZone = {
  name: 'Factory Zone',
  latitude: 21.259843683720433,
  longitude: 72.9386185449755,
  radiusMeters: 20
};

export function buildFactoryZoneScript(zone: FactoryZone = FACTORY_ZONE): string {
  return `
    const fallbackFactoryZone = {
      name: ${JSON.stringify(zone.name)},
      latitude: ${zone.latitude},
      longitude: ${zone.longitude},
      radiusMeters: ${zone.radiusMeters}
    };
    let factoryZone = { ...fallbackFactoryZone };
    let factoryZoneCircle;
    let factoryZoneCenterMarker;

    function renderFactoryZone() {
      const factoryLatLng = [factoryZone.latitude, factoryZone.longitude];
      if (!factoryZoneCircle) {
        factoryZoneCircle = L.circle(factoryLatLng, {
          color: '#38bdf8',
          weight: 2,
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          dashArray: '6 6'
        }).addTo(map);
      }
      factoryZoneCircle.setLatLng(factoryLatLng);
      factoryZoneCircle.setRadius(factoryZone.radiusMeters);
      factoryZoneCircle.bindPopup('<strong>' + factoryZone.name + '</strong><br>' + factoryZone.radiusMeters + 'm radius');

      if (!factoryZoneCenterMarker) {
        factoryZoneCenterMarker = L.circleMarker(factoryLatLng, {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#0ea5e9',
          fillOpacity: 1
        }).addTo(map);
      }
      factoryZoneCenterMarker.setLatLng(factoryLatLng);
      factoryZoneCenterMarker.bindPopup('<strong>' + factoryZone.name + '</strong><br>' + factoryZone.radiusMeters + 'm radius');
    }

    async function loadFactoryZoneConfig() {
      try {
        const response = await fetch('/geofence-config', { cache: 'no-store' });
        if (!response.ok) throw new Error('geofence config failed');
        const data = await response.json();
        const config = data && data.config ? data.config : {};
        const latitude = Number(config.latitude);
        const longitude = Number(config.longitude);
        const radiusMeters = Number(config.radiusMeters);
        if (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          Number.isFinite(radiusMeters) &&
          radiusMeters > 0
        ) {
          factoryZone = {
            name: factoryZone.name || fallbackFactoryZone.name,
            latitude,
            longitude,
            radiusMeters
          };
        } else {
          factoryZone = { ...fallbackFactoryZone };
        }
      } catch (error) {
        factoryZone = { ...fallbackFactoryZone };
      }
      renderFactoryZone();
    }

    renderFactoryZone();
    const factoryZoneReady = loadFactoryZoneConfig();
  `;
}
