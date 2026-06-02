import { FACTORY_ZONE, FactoryZone } from '../map/factoryZone';
import { StopEvent } from '../stops/stopDetectionService';
import { buildStopSummary, StopSummary } from '../stops/stopReport';
import { UserRole } from '../types';

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
    speedKmh?: number;
    bearing?: number;
  }>;
  stops: StopEvent[];
  stopSummary: StopSummary;
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
  factoryZone: FactoryZone = FACTORY_ZONE,
  stops: StopEvent[] = []
): DeliveryHistoryReport {
  const sorted = rawPoints
    .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
    .slice()
    .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
  const stablePoints = filterStablePoints(sorted);
  const rejectedPointCount = sorted.length - stablePoints.length;
  const first = stablePoints[0];
  const last = stablePoints[stablePoints.length - 1];
  let dailyDistanceMeters = 0;
  let movingTimeMs = 0;
  let stoppedTimeMs = 0;

  for (let i = 0; i < stablePoints.length - 1; i += 1) {
    const current = stablePoints[i];
    const next = stablePoints[i + 1];
    const gapMs = Math.max(0, Number(next.locationUpdatedAt || 0) - Number(current.locationUpdatedAt || 0));
    const distance = distanceMeters(current.latitude, current.longitude, next.latitude, next.longitude);
    if (distance >= MOVING_SEGMENT_DISTANCE_METERS) {
      dailyDistanceMeters += distance;
      movingTimeMs += gapMs;
    } else {
      stoppedTimeMs += gapMs;
    }
  }

  const departureAt = firstDepartureAt(stablePoints, factoryZone);
  return {
    date,
    userId: first?.userId || '',
    name: first?.name || '',
    pointCount: stablePoints.length,
    rejectedPointCount,
    dailyDistanceMeters,
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
      speedKmh: point.speedKmh,
      bearing: point.bearing
    })),
    stops,
    stopSummary: buildStopSummary(stops)
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
  if (points.length < 2) return points.filter(hasTrustedAccuracy);

  const stable: DeliveryHistoryPoint[] = [];
  points.forEach((point) => {
    if (!hasTrustedAccuracy(point)) return;
    const previous = stable[stable.length - 1];
    if (!previous) {
      stable.push(point);
      return;
    }

    const deltaMs = Number(point.locationUpdatedAt || 0) - Number(previous.locationUpdatedAt || 0);
    if (deltaMs <= 0) return;
    const distance = distanceMeters(previous.latitude, previous.longitude, point.latitude, point.longitude);
    const speedKmh = (distance / 1000) / (deltaMs / 3600000);
    const hardJump = deltaMs <= MIN_GPS_JUMP_INTERVAL_MS && distance >= MAX_GPS_JUMP_METERS;
    if (hardJump || speedKmh > MAX_GPS_JUMP_SPEED_KMH) return;
    stable.push(point);
  });

  return stable;
}

function hasTrustedAccuracy(point: DeliveryHistoryPoint): boolean {
  const accuracy = Number(point.accuracy || 0);
  return !accuracy || accuracy <= MAX_FILTERED_ACCURACY_METERS;
}

function firstDepartureAt(points: DeliveryHistoryPoint[], factoryZone: FactoryZone): number | undefined {
  return points.find((point) => !isInsideFactoryZone(point, factoryZone))?.locationUpdatedAt;
}

function returnToFactoryAt(points: DeliveryHistoryPoint[], factoryZone: FactoryZone): number | undefined {
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

function isInsideFactoryZone(point: DeliveryHistoryPoint, factoryZone: FactoryZone): boolean {
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
