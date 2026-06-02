import { StopEvent } from './stopDetectionService';

export type StopSummary = {
  totalStops: number;
  totalStoppedTimeMs: number;
  longestStopMs: number;
};

export function buildStopSummary(stops: StopEvent[]): StopSummary {
  return stops.reduce((summary, stop) => {
    const duration = Number(stop.durationMs || 0);
    summary.totalStops += 1;
    summary.totalStoppedTimeMs += duration;
    summary.longestStopMs = Math.max(summary.longestStopMs, duration);
    return summary;
  }, {
    totalStops: 0,
    totalStoppedTimeMs: 0,
    longestStopMs: 0
  });
}
