export function buildStopMarkersScript(): string {
  return `
    const stopMarkers = new Map();

    function stopMarkerKey(userIdValue, stop, index) {
      return userIdValue + ':' + index + ':' + Math.round(Number(stop.startTime || 0) / 60000);
    }

    function updateStopMarkers(points) {
      const grouped = new Map();
      points.forEach((point) => {
        if (!Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) return;
        if (userId && point.userId !== userId) return;
        if (!grouped.has(point.userId)) grouped.set(point.userId, []);
        grouped.get(point.userId).push(point);
      });

      const visibleKeys = new Set();
      grouped.forEach((userPoints, key) => {
        const reportPoints = simplifyPoints(userPoints
          .slice()
          .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0)));
        if (reportPoints.length < 2) return;
        const activeTrip = splitFactoryTrips(reportPoints).find((trip) => !trip.isComplete);
        const stopSourcePoints = forceLiveMapMode
          ? (activeTrip ? activeTrip.points : [])
          : reportPoints;
        if (stopSourcePoints.length < 2) return;
        const report = buildTripReport(stopSourcePoints);
        report.stops.forEach((stop, index) => {
          const markerKey = stopMarkerKey(key, stop, index);
          visibleKeys.add(markerKey);
          const latLng = [stop.latitude, stop.longitude];
          if (!stopMarkers.has(markerKey)) {
            stopMarkers.set(markerKey, L.circleMarker(latLng, {
              radius: 8,
              color: '#ffffff',
              weight: 2,
              fillColor: '#ef4444',
              fillOpacity: 1
            }).addTo(map));
          }
          const marker = stopMarkers.get(markerKey);
          marker.setLatLng(latLng);
          marker.bindPopup('<strong>Stop point</strong><br>' +
            escapeText(formatDuration(stop.durationMs)) + '<br>1 min thi vadhu ubho ryo');
        });
      });

      stopMarkers.forEach((marker, key) => {
        if (!visibleKeys.has(key)) {
          map.removeLayer(marker);
          stopMarkers.delete(key);
        }
      });
    }
  `;
}
