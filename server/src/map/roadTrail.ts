export function buildRoadTrailScript(): string {
  return `
    const ROAD_ROUTE_BASE_URL = '/road-route?coordinates=';
    const ROAD_ROUTE_MAX_POINTS = 35;
    const ROAD_ROUTE_MIN_DISTANCE_METERS = 50;
    const ROAD_ROUTE_MIN_TIME_MS = 90000;
    const ROAD_ROUTE_MAX_ACCURACY_METERS = 150;
    const roadTrailState = new Map();
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

    function roadTrailPointKey(point) {
      return [
        Math.round(Number(point.latitude) * 100000),
        Math.round(Number(point.longitude) * 100000),
        Math.floor(Number(point.locationUpdatedAt || 0) / 30000)
      ].join(',');
    }

    function isRoadTrailPrefix(oldKeys, nextKeys) {
      if (!oldKeys.length || oldKeys.length > nextKeys.length) return false;
      for (let index = 0; index < oldKeys.length; index += 1) {
        if (oldKeys[index] !== nextKeys[index]) return false;
      }
      return true;
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
      const coordinates = data && data.code === 'Ok' && data.routes && data.routes[0] && data.routes[0].geometry
        ? data.routes[0].geometry.coordinates
        : [];
      if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error('Road route empty');
      return coordinates
        .map((coordinate) => [Number(coordinate[1]), Number(coordinate[0])])
        .filter((coordinate) => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]));
    }

    function applyRoadTrail(key, userPoints, line, color) {
      const roadPoints = sampleRoadTrailPoints(userPoints);
      if (roadPoints.length < 2) return;
      const nextKeys = roadPoints.map(roadTrailPointKey);
      const nextSignature = nextKeys.join(';');
      const state = roadTrailState.get(key) || { pointKeys: [], sampledPoints: [], latLngs: [] };

      if (Array.isArray(state.latLngs) && state.latLngs.length > 1) {
        line.setLatLngs(state.latLngs);
        line.setStyle({ color, dashArray: '', opacity: 0.85 });
      }

      if (state.pointSignature === nextSignature || state.pendingSignature === nextSignature) return;
      if (state.pendingSignature) return;

      const oldKeys = Array.isArray(state.pointKeys) ? state.pointKeys : [];
      const appendOnly = isRoadTrailPrefix(oldKeys, nextKeys);
      const requestPoints = appendOnly && state.sampledPoints.length
        ? [state.sampledPoints[state.sampledPoints.length - 1]].concat(roadPoints.slice(oldKeys.length))
        : roadPoints;
      if (requestPoints.length < 2) return;

      roadTrailState.set(key, Object.assign({}, state, {
        pendingSignature: nextSignature,
        pendingAppendOnly: appendOnly,
        pendingPointKeys: nextKeys,
        pendingSampledPoints: roadPoints
      }));

      fetchRoadLatLngs(requestPoints)
        .then((latLngs) => {
          const latest = roadTrailState.get(key) || {};
          if (latest.pendingSignature !== nextSignature || latLngs.length < 2) return;
          const previousLatLngs = Array.isArray(latest.latLngs) ? latest.latLngs : [];
          const routeLatLngs = latest.pendingAppendOnly && previousLatLngs.length > 1
            ? previousLatLngs.concat(latLngs.slice(1))
            : latLngs;
          roadTrailState.set(key, Object.assign({}, latest, {
            pointSignature: nextSignature,
            pointKeys: latest.pendingPointKeys || nextKeys,
            sampledPoints: latest.pendingSampledPoints || roadPoints,
            latLngs: routeLatLngs,
            pendingSignature: '',
            pendingAppendOnly: false,
            pendingPointKeys: [],
            pendingSampledPoints: []
          }));
          if (historyLines.has(key)) {
            historyLines.get(key).setLatLngs(routeLatLngs);
            historyLines.get(key).setStyle({ color, dashArray: '', opacity: 0.85 });
          }
        })
        .catch(() => {
          const latest = roadTrailState.get(key) || {};
          if (latest.pendingSignature === nextSignature) {
            roadTrailState.set(key, Object.assign({}, latest, {
              pendingSignature: '',
              pendingAppendOnly: false,
              pendingPointKeys: [],
              pendingSampledPoints: []
            }));
          }
        });
    }
  `;
}
