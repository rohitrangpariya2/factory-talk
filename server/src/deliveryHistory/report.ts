import { FACTORY_ZONE, FactoryZone } from '../map/factoryZone';
import { StopEvent } from '../stops/stopDetectionService';
import { buildStopSummary, StopSummary } from '../stops/stopReport';
import { UserRole } from '../types';

type FactoryBounds = Pick<FactoryZone, 'latitude' | 'longitude' | 'radiusMeters'>;

type RejectionReason = 'invalidCoordinate' | 'poorAccuracy' | 'badTimestamp' | 'impossibleJump';

export type DeliveryDistanceOverride = {
  source: 'road_matched' | 'raw_gps';
  distanceMeters?: number;
  reason?: string;
};

export type DeliveryHistoryPoint = {
  userId: string;
  name: string;
  role: UserRole;
  latitude: number;
  longitude: number;
  accuracy?: number;
  receivedAt?: number;
  locationUpdatedAt: number;
  speedKmh?: number;
  bearing?: number;
  bearingAccuracyDegrees?: number;
  createdAt?: number;
};

export type DeliveryHistoryReport = {
  date: string;
  userId: string;
  name: string;
  pointCount: number;
  rejectedPointCount: number;
  dailyDistanceMeters: number;
  rawGpsDistanceMeters: number;
  matchedRoadDistanceMeters?: number;
  distanceSource: 'road_matched' | 'raw_gps';
  movingTimeMs: number;
  stoppedTimeMs: number;
  firstDepartureAt?: number;
  returnToFactoryAt?: number;
  firstPointAt?: number;
  lastPointAt?: number;
  routeReplay: Array<{
    latitude: number;
    longitude: number;
    locationUpdatedAt: number;
    accuracy?: number;
    speedKmh?: number;
    bearing?: number;
  }>;
  stops: StopEvent[];
  stopSummary: StopSummary;
  distanceDiagnostics: {
    totalReceivedPoints: number;
    acceptedPoints: number;
    rejectedPointCount: number;
    rejectedByReason: Record<RejectionReason, number>;
    rawGpsDistanceMeters: number;
    matchedRoadDistanceMeters?: number;
    pointTimeGapsMs: number[];
    accuracyMeters: {
      min?: number;
      max?: number;
      avg?: number;
    };
    fallbackReason?: string;
  };
};

export type DeliveryHistoryDateRange = {
  date: string;
  startMs: number;
  endMs: number;
};

const MAX_FILTERED_ACCURACY_METERS = 100;
const MAX_GPS_JUMP_SPEED_KMH = 95;
const MAX_GPS_JUMP_METERS = 260;
const MIN_GPS_JUMP_INTERVAL_MS = 4000;
const MOVING_SEGMENT_DISTANCE_METERS = 60;
const RETURN_CONFIRM_MS = 60 * 1000;

export function parseDeliveryHistoryDateRange(
  dateValue: string,
  timezoneOffsetMinutes?: number
): DeliveryHistoryDateRange {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new Error('date must use YYYY-MM-DD format');
  }

  const [year, month, day] = dateValue.split('-').map(Number);
  const utcValidation = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const hasBrowserOffset = Number.isFinite(timezoneOffsetMinutes);
  const start = hasBrowserOffset
    ? new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) + Number(timezoneOffsetMinutes) * 60 * 1000)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    utcValidation.getUTCFullYear() !== year ||
    utcValidation.getUTCMonth() !== month - 1 ||
    utcValidation.getUTCDate() !== day
  ) {
    throw new Error('date is invalid');
  }

  const startMs = start.getTime();
  return {
    date: dateValue,
    startMs,
    endMs: startMs + 24 * 60 * 60 * 1000
  };
}

export function buildDeliveryHistoryReport(
  rawPoints: DeliveryHistoryPoint[],
  date: string,
  factoryZone: FactoryBounds = FACTORY_ZONE,
  stops: StopEvent[] = [],
  distanceOverride?: DeliveryDistanceOverride
): DeliveryHistoryReport {
  const analysis = analyzeStablePoints(rawPoints);
  const stablePoints = analysis.stablePoints;
  const rejectedPointCount = analysis.rejectedPointCount;
  const first = stablePoints[0];
  const last = stablePoints[stablePoints.length - 1];
  let rawGpsDistanceMeters = 0;
  let movingTimeMs = 0;
  let stoppedTimeMs = 0;

  for (let i = 0; i < stablePoints.length - 1; i += 1) {
    const current = stablePoints[i];
    const next = stablePoints[i + 1];
    const gapMs = Math.max(0, Number(next.locationUpdatedAt || 0) - Number(current.locationUpdatedAt || 0));
    const distance = distanceMeters(current.latitude, current.longitude, next.latitude, next.longitude);
    if (distance >= MOVING_SEGMENT_DISTANCE_METERS) {
      rawGpsDistanceMeters += distance;
      movingTimeMs += gapMs;
    } else {
      stoppedTimeMs += gapMs;
    }
  }

  const matchedRoadDistanceMeters = distanceOverride?.source === 'road_matched' &&
    Number.isFinite(Number(distanceOverride.distanceMeters)) &&
    Number(distanceOverride.distanceMeters) >= 0
    ? Number(distanceOverride.distanceMeters)
    : undefined;
  const dailyDistanceMeters = matchedRoadDistanceMeters ?? rawGpsDistanceMeters;
  const distanceSource = matchedRoadDistanceMeters === undefined ? 'raw_gps' : 'road_matched';
  const departureAt = firstDepartureAt(stablePoints, factoryZone);
  return {
    date,
    userId: first?.userId || '',
    name: first?.name || '',
    pointCount: stablePoints.length,
    rejectedPointCount,
    dailyDistanceMeters,
    rawGpsDistanceMeters,
    matchedRoadDistanceMeters,
    distanceSource,
    movingTimeMs,
    stoppedTimeMs,
    firstDepartureAt: departureAt,
    returnToFactoryAt: departureAt === undefined ? undefined : returnToFactoryAt(stablePoints, factoryZone),
    firstPointAt: first?.locationUpdatedAt,
    lastPointAt: last?.locationUpdatedAt,
    routeReplay: stablePoints.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      locationUpdatedAt: point.locationUpdatedAt,
      accuracy: point.accuracy,
      speedKmh: point.speedKmh,
      bearing: point.bearing
    })),
    stops,
    stopSummary: buildStopSummary(stops),
    distanceDiagnostics: {
      totalReceivedPoints: rawPoints.length,
      acceptedPoints: stablePoints.length,
      rejectedPointCount,
      rejectedByReason: analysis.rejectedByReason,
      rawGpsDistanceMeters,
      matchedRoadDistanceMeters,
      pointTimeGapsMs: analysis.pointTimeGapsMs,
      accuracyMeters: analysis.accuracyMeters,
      fallbackReason: matchedRoadDistanceMeters === undefined ? distanceOverride?.reason : undefined
    }
  };
}

export function deliveryHistoryReportToCsv(report: DeliveryHistoryReport): string {
  const rows = [
    [
      'date',
      'userId',
      'name',
      'dailyDistanceKm',
      'movingTime',
      'stoppedTime',
      'firstDeparture',
      'returnToFactory',
      'totalStops',
      'totalStoppedTime',
      'longestStop',
      'pointCount',
      'rejectedPointCount'
    ],
    [
      report.date,
      report.userId,
      report.name,
      (report.dailyDistanceMeters / 1000).toFixed(2),
      formatDuration(report.movingTimeMs),
      formatDuration(report.stoppedTimeMs),
      formatTimestamp(report.firstDepartureAt),
      formatTimestamp(report.returnToFactoryAt),
      String(report.stopSummary.totalStops),
      formatDuration(report.stopSummary.totalStoppedTimeMs),
      formatDuration(report.stopSummary.longestStopMs),
      String(report.pointCount),
      String(report.rejectedPointCount)
    ]
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function filterStablePoints(points: DeliveryHistoryPoint[]): DeliveryHistoryPoint[] {
  return analyzeStablePoints(points).stablePoints;
}

function analyzeStablePoints(points: DeliveryHistoryPoint[]): {
  stablePoints: DeliveryHistoryPoint[];
  rejectedPointCount: number;
  rejectedByReason: Record<RejectionReason, number>;
  pointTimeGapsMs: number[];
  accuracyMeters: { min?: number; max?: number; avg?: number };
} {
  const rejectedByReason: Record<RejectionReason, number> = {
    invalidCoordinate: 0,
    poorAccuracy: 0,
    badTimestamp: 0,
    impossibleJump: 0
  };
  const sorted = points
    .slice()
    .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
  const accuracies = sorted
    .map((point) => Number(point.accuracy || 0))
    .filter((accuracy) => Number.isFinite(accuracy) && accuracy > 0);
  const stable: DeliveryHistoryPoint[] = [];
  const pointTimeGapsMs: number[] = [];
  sorted.forEach((point) => {
    if (!Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) {
      rejectedByReason.invalidCoordinate += 1;
      return;
    }
    if (!hasTrustedAccuracy(point)) {
      rejectedByReason.poorAccuracy += 1;
      return;
    }
    const previous = stable[stable.length - 1];
    if (!previous) {
      stable.push(point);
      return;
    }

    const deltaMs = Number(point.locationUpdatedAt || 0) - Number(previous.locationUpdatedAt || 0);
    if (deltaMs <= 0) {
      rejectedByReason.badTimestamp += 1;
      return;
    }
    pointTimeGapsMs.push(deltaMs);
    const distance = distanceMeters(previous.latitude, previous.longitude, point.latitude, point.longitude);
    const speedKmh = (distance / 1000) / (deltaMs / 3600000);
    const hardJump = deltaMs <= MIN_GPS_JUMP_INTERVAL_MS && distance >= MAX_GPS_JUMP_METERS;
    if (hardJump || speedKmh > MAX_GPS_JUMP_SPEED_KMH) {
      rejectedByReason.impossibleJump += 1;
      return;
    }
    stable.push(point);
  });

  return {
    stablePoints: stable,
    rejectedPointCount: sorted.length - stable.length,
    rejectedByReason,
    pointTimeGapsMs,
    accuracyMeters: accuracyStats(accuracies)
  };
}

function accuracyStats(accuracies: number[]): { min?: number; max?: number; avg?: number } {
  if (!accuracies.length) return {};
  const total = accuracies.reduce((sum, accuracy) => sum + accuracy, 0);
  return {
    min: Math.min(...accuracies),
    max: Math.max(...accuracies),
    avg: total / accuracies.length
  };
}

function hasTrustedAccuracy(point: DeliveryHistoryPoint): boolean {
  const accuracy = Number(point.accuracy || 0);
  return !accuracy || accuracy <= MAX_FILTERED_ACCURACY_METERS;
}

function firstDepartureAt(points: DeliveryHistoryPoint[], factoryZone: FactoryBounds): number | undefined {
  return points.find((point) => !isInsideFactoryZone(point, factoryZone))?.locationUpdatedAt;
}

function returnToFactoryAt(points: DeliveryHistoryPoint[], factoryZone: FactoryBounds): number | undefined {
  let returnStartedAt = 0;
  for (const point of points) {
    if (isInsideFactoryZone(point, factoryZone)) {
      if (!returnStartedAt) returnStartedAt = point.locationUpdatedAt;
      if (point.locationUpdatedAt - returnStartedAt >= RETURN_CONFIRM_MS) return point.locationUpdatedAt;
    } else {
      returnStartedAt = 0;
    }
  }
  return undefined;
}

function isInsideFactoryZone(point: DeliveryHistoryPoint, factoryZone: FactoryBounds): boolean {
  return distanceMeters(point.latitude, point.longitude, factoryZone.latitude, factoryZone.longitude) <= factoryZone.radiusMeters;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    hourCycle: 'h12'
  });
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return '"' + value.replace(/"/g, '""') + '"';
}
