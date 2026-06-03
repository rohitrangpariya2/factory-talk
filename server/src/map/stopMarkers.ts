export function buildStopMarkersScript(): string {
  return `
    const stopMarkers = new Map();
    const LIVE_STOP_MARKER_MIN_DURATION_MS = 5 * 60 * 1000;
    let showStopMarkers = true;

    function stopMarkerKey(userIdValue, stop, index) {
      return userIdValue + ':' + index + ':' + Math.round(Number(stop.startTime || 0) / 60000);
    }

    function updateStopToggleButton() {
      const button = document.getElementById('showStopsButton');
      if (!button) return;
      button.textContent = showStopMarkers ? 'Show Stops ON' : 'Show Stops OFF';
      button.classList.toggle('off', !showStopMarkers);
    }

    function removeStopMarkers() {
      stopMarkers.forEach((marker) => map.removeLayer(marker));
      stopMarkers.clear();
    }

    function stopMarkerHtml(displayIndex) {
      return '<div class="live-stop-marker">' + escapeText(displayIndex + 1) + '</div>';
    }

    function stopPopupHtml(stop, displayIndex) {
      return '<strong>Stop ' + (displayIndex + 1) + '</strong>' +
        '<br>Duration: ' + escapeText(formatDuration(stop.durationMs)) +
        '<br>Start: ' + escapeText(formatClock(stop.startTime)) +
        '<br>End: ' + escapeText(stop.endTime ? formatClock(stop.endTime) : 'Still stopped');
    }

    function updateStopMarkers(points) {
      if (!showStopMarkers) {
        removeStopMarkers();
        return;
      }

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
        const meaningfulStops = report.stops.filter((stop) =>
          Number(stop.durationMs || 0) >= LIVE_STOP_MARKER_MIN_DURATION_MS
        );
        meaningfulStops.forEach((stop, displayIndex) => {
          const index = displayIndex;
          const markerKey = stopMarkerKey(key, stop, index);
          visibleKeys.add(markerKey);
          const latLng = [stop.latitude, stop.longitude];
          if (!stopMarkers.has(markerKey)) {
            stopMarkers.set(markerKey, L.marker(latLng, {
              icon: L.divIcon({
                className: '',
                iconSize: [22, 22],
                iconAnchor: [11, 11],
                html: stopMarkerHtml(displayIndex)
              })
            }).addTo(map));
          }
          const marker = stopMarkers.get(markerKey);
          marker.setLatLng(latLng);
          marker.setIcon(L.divIcon({
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: stopMarkerHtml(displayIndex)
          }));
          marker.bindPopup(stopPopupHtml(stop, displayIndex));
        });
      });

      stopMarkers.forEach((marker, key) => {
        if (!visibleKeys.has(key)) {
          map.removeLayer(marker);
          stopMarkers.delete(key);
        }
      });
      updateStopToggleButton();
    }

    function toggleStopMarkers() {
      showStopMarkers = !showStopMarkers;
      if (!showStopMarkers) {
        removeStopMarkers();
      } else {
        updateStopMarkers(lastHistoryPoints || []);
      }
      updateStopToggleButton();
    }

    window.toggleStopMarkers = toggleStopMarkers;
    updateStopToggleButton();
  `;
}
