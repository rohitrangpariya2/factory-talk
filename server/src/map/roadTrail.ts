export function buildRoadTrailScript(): string {
  return `
    const ROAD_ROUTE_BASE_URL = '/road-route?coordinates=';
    const ROAD_ROUTE_MAX_POINTS = 60;
    const ROAD_ROUTE_MIN_DISTANCE_METERS = 20;
    const ROAD_ROUTE_MIN_TIME_MS = 20000;
    const ROAD_ROUTE_MAX_ACCURACY_METERS = 150;
    map.attributionControl.addAttribution('Routes: OSRM');

    function sampleRoadTrailPoints(points) {
      const cleanPoints = points
        .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
        .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
      const accuratePoints = cleanPoints.filter((point) => {
        const accuracy = Number(point.accuracy || 0);
        return !accuracy || accuracy <= ROAD_ROUTE_MAX_ACCURACY_METERS;
      });
      const sourcePoints = accuratePoints.length >= 2 ? accuratePoints : cleanPoints;
      const distinct = [];
      sourcePoints.forEach((point, index) => {
        const last = distinct[distinct.length - 1];
        const isLast = index === sourcePoints.length - 1;
        const gapMs = last ? Math.abs(Number(point.locationUpdatedAt || 0) - Number(last.locationUpdatedAt || 0)) : 0;
        const distance = last ? distanceMeters(last, point) : Infinity;
        if (
          !last ||
          distance >= ROAD_ROUTE_MIN_DISTANCE_METERS ||
          (gapMs >= ROAD_ROUTE_MIN_TIME_MS && distance >= ROAD_ROUTE_MIN_DISTANCE_METERS / 2) ||
          (isLast && distance >= ROAD_ROUTE_MIN_DISTANCE_METERS / 2)
        ) {
          distinct.push(point);
        }
      });
      if (distinct.length <= ROAD_ROUTE_MAX_POINTS) return distinct;
      const sampled = [];
      for (let index = 0; index < ROAD_ROUTE_MAX_POINTS; index += 1) {
        const sourceIndex = Math.round(index * (distinct.length - 1) / (ROAD_ROUTE_MAX_POINTS - 1));
        const point = distinct[sourceIndex];
        if (sampled[sampled.length - 1] !== point) sampled.push(point);
      }
      return sampled;
    }

    function buildRoadRouteUrl(points) {
      const coordinates = points
        .map((point) => Number(point.longitude).toFixed(6) + ',' + Number(point.latitude).toFixed(6))
        .join(';');
      return ROAD_ROUTE_BASE_URL + encodeURIComponent(coordinates);
    }

    async function fetchRoadLatLngs(points) {
      const response = await fetch(buildRoadRouteUrl(points), { cache: 'no-store' });
      if (!response.ok) throw new Error('Road route failed');
      const data = await response.json();
      let coordinates = [];
      if (data && data.code === 'Ok' && data.matchings && data.matchings.length) {
        coordinates = data.matchings
          .map((matching) => matching && matching.geometry && matching.geometry.coordinates ? matching.geometry.coordinates : [])
          .flat();
      } else if (data && data.code === 'Ok' && data.routes && data.routes[0] && data.routes[0].geometry) {
        coordinates = data.routes[0].geometry.coordinates;
      }
      if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error('Road route empty');
      return coordinates
        .map((coordinate) => [Number(coordinate[1]), Number(coordinate[0])])
        .filter((coordinate) => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]));
    }
  `;
}
