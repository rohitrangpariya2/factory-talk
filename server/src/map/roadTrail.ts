export function buildRoadTrailScript(): string {
  return `
    const ROAD_MATCH_BASE_URL = '/road-match';
    const ROAD_MATCH_MAX_POINTS = 60;
    const ROAD_MATCH_MIN_DISTANCE_METERS = 15;
    const ROAD_MATCH_MIN_TIME_MS = 20000;
    const ROAD_MATCH_MAX_ACCURACY_METERS = 50;
    const ROAD_MATCH_MIN_INTERVAL_MS = 12000;
    const ROAD_MATCH_MIN_CONFIDENCE = 0.35;
    let lastRoadMatchRequestAt = 0;
    map.attributionControl.addAttribution('Routes: OSRM');

    function sampleRoadTrailPoints(points) {
      const cleanPoints = points
        .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
        .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
      const accuratePoints = cleanPoints.filter((point) => {
        const accuracy = Number(point.accuracy || 0);
        return !accuracy || accuracy <= ROAD_MATCH_MAX_ACCURACY_METERS;
      });
      const sourcePoints = accuratePoints.length >= 2 ? accuratePoints : cleanPoints;
      const distinct = [];
      sourcePoints.forEach((point, index) => {
        const last = distinct[distinct.length - 1];
        const isLast = index === sourcePoints.length - 1;
        const gapMs = last ? Math.abs(Number(point.locationUpdatedAt || 0) - Number(last.locationUpdatedAt || 0)) : 0;
        const speedKmh = last && gapMs > 0 ? (distanceMeters(last, point) / (gapMs / 3600000)) / 1000 : 0;
        if (last && gapMs > 0 && speedKmh > 90) return;
        const distance = last ? distanceMeters(last, point) : Infinity;
        if (
          !last ||
          distance >= ROAD_MATCH_MIN_DISTANCE_METERS ||
          (gapMs >= ROAD_MATCH_MIN_TIME_MS && distance >= ROAD_MATCH_MIN_DISTANCE_METERS / 2) ||
          (isLast && distance >= ROAD_MATCH_MIN_DISTANCE_METERS / 2)
        ) {
          distinct.push(point);
        }
      });
      if (distinct.length <= ROAD_MATCH_MAX_POINTS) return distinct;
      const sampled = [];
      for (let index = 0; index < ROAD_MATCH_MAX_POINTS; index += 1) {
        const sourceIndex = Math.round(index * (distinct.length - 1) / (ROAD_MATCH_MAX_POINTS - 1));
        const point = distinct[sourceIndex];
        if (sampled[sampled.length - 1] !== point) sampled.push(point);
      }
      return sampled;
    }

    function buildRoadMatchPayload(points) {
      return {
        points: points.map((point) => ({
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          timestamp: Number(point.locationUpdatedAt || point.timestamp || 0) || undefined,
          accuracy: Number(point.accuracy || 0) || undefined
        }))
      };
    }

    async function fetchRoadLatLngs(points) {
      const options = arguments[1] || {};
      if (!options.force) {
        const now = Date.now();
        if (now - lastRoadMatchRequestAt < ROAD_MATCH_MIN_INTERVAL_MS) {
          throw new Error('Road match debounced');
        }
        lastRoadMatchRequestAt = now;
      }
      const response = await fetch(ROAD_MATCH_BASE_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRoadMatchPayload(points))
      });
      if (!response.ok) throw new Error('Road match failed (' + response.status + ')');
      const data = await response.json();
      const hasRoadMatchStatus = data && data.status === 'matched';
      if (!hasRoadMatchStatus) {
        const reason = data && data.reason ? String(data.reason) : 'Road match unavailable';
        throw new Error('Road match fallback: ' + reason);
      }
      const confidence = Number(data.confidence);
      if (Number.isFinite(confidence) && confidence < ROAD_MATCH_MIN_CONFIDENCE) {
        throw new Error('Road match low confidence');
      }
      const roadSegments = (Array.isArray(data.segments) ? data.segments : [])
        .map((segment) => (Array.isArray(segment) ? segment : [])
          .map((coordinate) => [Number(coordinate.latitude), Number(coordinate.longitude)])
          .filter((coordinate) => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])))
        .filter((segment) => segment.length >= 2);
      if (!roadSegments.length && Array.isArray(data.coordinates)) {
        const fallbackSegment = data.coordinates
          .map((coordinate) => [Number(coordinate.latitude), Number(coordinate.longitude)])
          .filter((coordinate) => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]));
        if (fallbackSegment.length >= 2) roadSegments.push(fallbackSegment);
      }
      if (!roadSegments.length) {
        throw new Error('Road match returned invalid status');
      }
      const roadLatLngs = roadSegments.flat();
      if (roadLatLngs.length < 2) throw new Error('Road match empty');
      roadLatLngs.roadMatchStatus = data.status;
      roadLatLngs.roadDistanceMeters = Number(data.distanceMeters);
      roadLatLngs.roadSegments = roadSegments;
      roadLatLngs.roadMatchConfidence = Number.isFinite(confidence) ? confidence : 1;
      roadLatLngs.unmatchedGapsCount = Number(data.unmatchedGapsCount || Math.max(0, roadSegments.length - 1));
      roadLatLngs.fallbackReason = data.reason || '';
      return roadLatLngs;
    }
  `;
}
