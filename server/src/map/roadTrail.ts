export function buildRoadTrailScript(): string {
  return `
    const ROAD_ROUTE_BASE_URL = '/road-route?coordinates=';
    const ROAD_ROUTE_MAX_POINTS = 25;
    const ROAD_ROUTE_MIN_INTERVAL_MS = 30000;
    const roadTrailState = new Map();
    map.attributionControl.addAttribution('Routes: OSRM');

    function sampleRoadTrailPoints(points) {
      const cleanPoints = points
        .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
        .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
      const distinct = [];
      cleanPoints.forEach((point) => {
        const last = distinct[distinct.length - 1];
        if (!last || distanceMeters(last, point) >= 15 || Math.abs(Number(point.locationUpdatedAt || 0) - Number(last.locationUpdatedAt || 0)) >= 60000) {
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

    function roadTrailSignature(points) {
      return points.map((point) => [
        Math.round(Number(point.latitude) * 100000),
        Math.round(Number(point.longitude) * 100000),
        Math.floor(Number(point.locationUpdatedAt || 0) / 30000)
      ].join(',')).join(';');
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
      const signature = roadTrailSignature(roadPoints);
      const state = roadTrailState.get(key) || {};
      if (state.routeSignature === signature && Array.isArray(state.latLngs) && state.latLngs.length > 1) {
        line.setLatLngs(state.latLngs);
        line.setStyle({ color, dashArray: '', opacity: 0.85 });
        return;
      }
      if (state.pendingSignature === signature) return;
      const now = Date.now();
      if (state.lastRequestedAt && now - state.lastRequestedAt < ROAD_ROUTE_MIN_INTERVAL_MS) return;
      roadTrailState.set(key, Object.assign({}, state, {
        pendingSignature: signature,
        lastRequestedAt: now
      }));

      fetchRoadLatLngs(roadPoints)
        .then((latLngs) => {
          const latest = roadTrailState.get(key) || {};
          if (latest.pendingSignature !== signature || latLngs.length < 2) return;
          roadTrailState.set(key, Object.assign({}, latest, {
            routeSignature: signature,
            latLngs,
            pendingSignature: ''
          }));
          if (historyLines.has(key)) {
            historyLines.get(key).setLatLngs(latLngs);
            historyLines.get(key).setStyle({ color, dashArray: '', opacity: 0.85 });
          }
        })
        .catch(() => {
          const latest = roadTrailState.get(key) || {};
          if (latest.pendingSignature === signature) {
            roadTrailState.set(key, Object.assign({}, latest, { pendingSignature: '' }));
          }
        });
    }
  `;
}
