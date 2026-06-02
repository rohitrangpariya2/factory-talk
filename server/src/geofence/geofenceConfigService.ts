import { db } from '../config/firebase';
import { FACTORY_ZONE } from '../map/factoryZone';

export type GeofenceConfig = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  bufferMeters: number;
  confirmationMs: number;
  maxAccuracyMeters: number;
};

const CONFIG_DOC = db.collection('settings').doc('factoryGeofence');

export const DEFAULT_GEOFENCE_CONFIG: GeofenceConfig = {
  latitude: FACTORY_ZONE.latitude,
  longitude: FACTORY_ZONE.longitude,
  radiusMeters: 100,
  bufferMeters: 20,
  confirmationMs: 30_000,
  maxAccuracyMeters: 100
};

let cachedConfig: GeofenceConfig = DEFAULT_GEOFENCE_CONFIG;
let lastLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

export async function getGeofenceConfig(forceRefresh = false): Promise<GeofenceConfig> {
  if (!forceRefresh && Date.now() - lastLoadedAt < CACHE_TTL_MS) return cachedConfig;

  const snapshot = await CONFIG_DOC.get();
  if (!snapshot.exists) {
    cachedConfig = DEFAULT_GEOFENCE_CONFIG;
  } else {
    cachedConfig = normalizeGeofenceConfig(snapshot.data() || {});
  }
  lastLoadedAt = Date.now();
  return cachedConfig;
}

export async function saveGeofenceConfig(input: Partial<GeofenceConfig>): Promise<GeofenceConfig> {
  const config = normalizeGeofenceConfig(input);
  await CONFIG_DOC.set({
    ...config,
    updatedAt: Date.now()
  }, { merge: true });
  cachedConfig = config;
  lastLoadedAt = Date.now();
  return config;
}

export function normalizeGeofenceConfig(input: Partial<GeofenceConfig>): GeofenceConfig {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const radiusMeters = Number(input.radiusMeters);
  const bufferMeters = Number(input.bufferMeters);
  const confirmationMs = Number(input.confirmationMs);
  const maxAccuracyMeters = Number(input.maxAccuracyMeters);

  return {
    latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      ? latitude
      : DEFAULT_GEOFENCE_CONFIG.latitude,
    longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
      ? longitude
      : DEFAULT_GEOFENCE_CONFIG.longitude,
    radiusMeters: Number.isFinite(radiusMeters) && radiusMeters >= 20 && radiusMeters <= 5000
      ? radiusMeters
      : DEFAULT_GEOFENCE_CONFIG.radiusMeters,
    bufferMeters: Number.isFinite(bufferMeters) && bufferMeters >= 5 && bufferMeters <= 500
      ? bufferMeters
      : DEFAULT_GEOFENCE_CONFIG.bufferMeters,
    confirmationMs: Number.isFinite(confirmationMs) && confirmationMs >= 5_000 && confirmationMs <= 10 * 60 * 1000
      ? confirmationMs
      : DEFAULT_GEOFENCE_CONFIG.confirmationMs,
    maxAccuracyMeters: Number.isFinite(maxAccuracyMeters) && maxAccuracyMeters >= 10 && maxAccuracyMeters <= 1000
      ? maxAccuracyMeters
      : DEFAULT_GEOFENCE_CONFIG.maxAccuracyMeters
  };
}
