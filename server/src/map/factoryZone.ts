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
  radiusMeters: 200
};

export function buildFactoryZoneScript(zone: FactoryZone = FACTORY_ZONE): string {
  return `
    const factoryZone = {
      name: ${JSON.stringify(zone.name)},
      latitude: ${zone.latitude},
      longitude: ${zone.longitude},
      radiusMeters: ${zone.radiusMeters}
    };
    const factoryLatLng = [factoryZone.latitude, factoryZone.longitude];
    L.circle(factoryLatLng, {
      radius: ${zone.radiusMeters},
      color: '#38bdf8',
      weight: 2,
      fillColor: '#38bdf8',
      fillOpacity: 0.12,
      dashArray: '6 6'
    }).addTo(map).bindPopup('<strong>' + factoryZone.name + '</strong><br>' + factoryZone.radiusMeters + 'm radius');
    L.circleMarker(factoryLatLng, {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: '#0ea5e9',
      fillOpacity: 1
    }).addTo(map).bindPopup('<strong>' + factoryZone.name + '</strong><br>' + factoryZone.radiusMeters + 'm radius');
  `;
}
