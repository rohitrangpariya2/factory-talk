const OSRM_ROUTE_BASE_URL = 'http://router.project-osrm.org/route/v1/driving/';
const MAX_ROAD_ROUTE_POINTS = 35;

export function normalizeRoadRouteCoordinates(input: string): string | null {
  const coordinates = input
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  if (coordinates.length < 2 || coordinates.length > MAX_ROAD_ROUTE_POINTS) {
    return null;
  }

  const normalized = coordinates.map((coordinate) => {
    const parts = coordinate.split(',');
    if (parts.length !== 2) return null;
    const longitude = Number(parts[0]);
    const latitude = Number(parts[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
    return `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
  });

  if (normalized.some((coordinate) => coordinate === null)) {
    return null;
  }

  return normalized.join(';');
}

export function buildOsrmRouteUrl(coordinates: string): string {
  return `${OSRM_ROUTE_BASE_URL}${coordinates}?overview=full&geometries=geojson&steps=false&annotations=false`;
}
