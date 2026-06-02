import { Server, Socket } from 'socket.io';
import { ConnectedUser, UserRole } from '../types';
import { auth } from '../config/firebase';
import { env } from '../config/env';
import { getUserById, updateUserOnlineStatus, updateFcmToken, getOfflineMemberTokens } from '../services/userService';
import { joinChannel, leaveChannel, leaveAllChannels, getChannelMembers, getSocketIdByUserId, removeUserSocket, isUserInChannel } from './roomManager';
import { requestFloor, releaseFloor, getFloorState, checkFloorTimeouts } from './floorControl';
import { sendBroadcastWakeUp } from '../services/fcmService';
import { logTalkStart, logTalkEnd } from '../services/logService';
import { persistLocationHistory } from '../services/locationHistoryService';
import { buildAudioRelayEvent } from './audioRelay';
import { buildAcceptedLocation } from './locationTelemetry';

let reminderSchedule: { onTime: string; offTime: string } | null = null;
const busyDisconnectGraceTimers = new Map<string, NodeJS.Timeout>();
type TrackedLocation = {
  userId: string;
  name: string;
  role: UserRole;
  latitude: number;
  longitude: number;
  accuracy?: number;
  isBusy?: boolean;
  receivedAt?: number;
  locationUpdatedAt: number;
  speedKmh?: number;
  bearing?: number;
  bearingAccuracyDegrees?: number;
  isCallActive?: boolean;
};

type LocationHistoryPoint = TrackedLocation & {
  sequence: number;
};

const latestLocations = new Map<string, TrackedLocation>();
const locationHistory = new Map<string, LocationHistoryPoint[]>();
const LOCATION_HISTORY_MAX_POINTS = 300;
const LOCATION_HISTORY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LOCATION_RECOVERY_REQUEST_INTERVAL_MS = 15_000;
let locationHistorySequence = 0;
let lastLocationRecoveryRequestedAt = 0;

export function getLatestLocations() {
  return Array.from(latestLocations.values());
}

export function getLocationHistory(userId?: string) {
  if (userId) {
    return locationHistory.get(userId) ?? [];
  }
  return Array.from(locationHistory.values()).flat();
}

function appendLocationHistory(location: TrackedLocation) {
  const points = locationHistory.get(location.userId) ?? [];
  const lastPoint = points[points.length - 1];
  const movedEnough = !lastPoint ||
    Math.abs(lastPoint.latitude - location.latitude) > 0.00003 ||
    Math.abs(lastPoint.longitude - location.longitude) > 0.00003;
  const waitedEnough = !lastPoint || location.locationUpdatedAt - lastPoint.locationUpdatedAt >= 30_000;

  if (!movedEnough && !waitedEnough) return;

  const cutoff = Date.now() - LOCATION_HISTORY_MAX_AGE_MS;
  const nextPoints = points
    .filter((point) => point.locationUpdatedAt >= cutoff)
    .concat({ ...location, sequence: ++locationHistorySequence })
    .slice(-LOCATION_HISTORY_MAX_POINTS);
  locationHistory.set(location.userId, nextPoints);
}

function requestLocationRecovery(io: Server) {
  const now = Date.now();
  if (now - lastLocationRecoveryRequestedAt < LOCATION_RECOVERY_REQUEST_INTERVAL_MS) return;
  lastLocationRecoveryRequestedAt = now;
  io.emit('request_location_update');
}

export function setupSocketHandler(io: Server) {
  
  // Auth Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const deviceId = socket.handshake.auth.deviceId;
      const deviceName = socket.handshake.auth.name || 'Factory Phone';
      const role = socket.handshake.auth.role || UserRole.WORKER;

      if (!token && env.allowDeviceAuth && deviceId) {
        socket.data.user = {
          socketId: socket.id,
          userId: deviceId,
          userName: deviceName,
          role,
          isBusy: false,
          isDeviceAuth: true
        } as ConnectedUser;
        next();
        return;
      }

      if (!token) throw new Error('No token provided');
      
      const decodedToken = await auth.verifyIdToken(token);
      const user = await getUserById(decodedToken.uid);
      if (!user) throw new Error('User not found in DB');

      socket.data.user = {
        socketId: socket.id,
        userId: user.id,
        userName: user.displayName,
        role: user.role,
        fcmToken: user.fcmToken,
        isBusy: false
      } as ConnectedUser;
      
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user: ConnectedUser = socket.data.user;
    console.log(`User connected: ${user.userName} (${socket.id})`);
    const pendingBusyTimer = busyDisconnectGraceTimers.get(user.userId);
    if (pendingBusyTimer) {
      clearTimeout(pendingBusyTimer);
      busyDisconnectGraceTimers.delete(user.userId);
    }

    if (!user.isDeviceAuth) {
      await updateUserOnlineStatus(user.userId, true);
    }
    
    // Auto-join common channel
    socket.emit('connected', { userId: user.userId });
    socket.emit('request_location_update');

    socket.on('join_channel', (channelId: string) => {
      socket.join(channelId);
      const latestLocation = latestLocations.get(user.userId);
      if (latestLocation) {
        user.latitude = latestLocation.latitude;
        user.longitude = latestLocation.longitude;
        user.locationUpdatedAt = latestLocation.locationUpdatedAt;
      }
      joinChannel(channelId, socket.id, user);
      
      const members = getChannelMembers(channelId);
      const floorState = getFloorState(channelId);
      
      socket.emit('channel_info', { members, floorHolder: floorState.currentSpeaker });
      if (reminderSchedule) {
        socket.emit('reminder_schedule_updated', reminderSchedule);
      }
      socket.to(channelId).emit('user_joined', {
        userId: user.userId,
        name: user.userName,
        role: user.role,
        isBusy: !!user.isBusy,
        latitude: user.latitude,
        longitude: user.longitude,
        locationUpdatedAt: user.locationUpdatedAt
      });
    });

    socket.on('set_reminder_schedule', (payload) => {
      const onTime = typeof payload?.onTime === 'string' ? payload.onTime : '';
      const offTime = typeof payload?.offTime === 'string' ? payload.offTime : '';
      if (!/^\d{2}:\d{2}$/.test(onTime) || !/^\d{2}:\d{2}$/.test(offTime)) return;
      reminderSchedule = { onTime, offTime };
      io.emit('reminder_schedule_updated', reminderSchedule);
    });

    socket.on('user_status', (payload) => {
      user.isBusy = !!payload?.isBusy;
      const latestLocation = latestLocations.get(user.userId);
      if (latestLocation) {
        latestLocations.set(user.userId, {
          ...latestLocation,
          isBusy: !!user.isBusy
        });
      }
      const channelIds = Array.from(socket.rooms).filter(room => room !== socket.id);
      for (const channelId of channelIds) {
        socket.to(channelId).emit('user_status', {
          userId: user.userId,
          isBusy: !!user.isBusy
        });
      }
    });

    socket.on('request_locations', () => {
      socket.emit('location_snapshot', {
        locations: Array.from(latestLocations.values())
      });
      if (latestLocations.size === 0) {
        requestLocationRecovery(io);
      }
    });

    socket.on('location_update', (payload) => {
      const latitude = Number(payload?.latitude);
      const longitude = Number(payload?.longitude);
      const accuracy = Number(payload?.accuracy);
      const locationTime = Number(payload?.locationTime);
      const speedKmh = payload?.speedKmh !== undefined ? Number(payload.speedKmh) : undefined;
      const bearing = payload?.bearing !== undefined ? Number(payload.bearing) : undefined;
      const bearingAccuracyDegrees = payload?.bearingAccuracyDegrees !== undefined ? Number(payload.bearingAccuracyDegrees) : undefined;
      const isCallActive = payload?.isCallActive !== undefined ? Boolean(payload.isCallActive) : undefined;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
      const now = Date.now();
      const fixTime = Number.isFinite(locationTime) &&
        locationTime > 946684800000 &&
        locationTime <= now + 5 * 60 * 1000
        ? locationTime
        : now;

      user.latitude = latitude;
      user.longitude = longitude;
      user.locationUpdatedAt = fixTime;
      const trackedLocation = buildAcceptedLocation({
        userId: user.userId,
        name: user.userName,
        role: user.role,
        latitude: user.latitude,
        longitude: user.longitude,
        accuracy: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : undefined,
        isBusy: !!user.isBusy,
        receivedAt: now,
        locationUpdatedAt: user.locationUpdatedAt,
        isCallActive
      }, latestLocations.get(user.userId), speedKmh, bearing, bearingAccuracyDegrees) as TrackedLocation;
      latestLocations.set(user.userId, trackedLocation);
      appendLocationHistory(trackedLocation);
      void persistLocationHistory(trackedLocation).catch((error) => {
        console.error('Failed to persist location history:', error);
      });

      io.emit('user_location_updated', trackedLocation);
    });

    socket.on('audio_chunk', (payload) => {
      if (!payload?.audio) return;

      const event = buildAudioRelayEvent(payload, {
        userId: user.userId,
        userName: user.userName
      });

      if (event.targetUserId) {
        const targetSocketId = getSocketIdByUserId(event.targetUserId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('audio_chunk', event);
        }
        return;
      }

      if (event.channelId) {
        socket.to(event.channelId).emit('audio_chunk', event);
      }
    });

    socket.on('leave_channel', (channelId: string) => {
      socket.leave(channelId);
      leaveChannel(channelId, socket.id);
      
      if (releaseFloor(channelId, socket.id)) {
        io.to(channelId).emit('floor_released');
      }
      
      if (!isUserInChannel(channelId, user.userId)) {
        socket.to(channelId).emit('user_left', { userId: user.userId });
      }
    });

    socket.on('request_floor', async (channelId: string) => {
      const result = requestFloor(channelId, socket.id, user.userId, user.userName, user.role);
      
      if (result.granted) {
        if (result.overriddenUser) {
          io.to(result.overriddenUser.socketId).emit('floor_revoked', { reason: 'Higher priority user took the floor' });
        }
        
        io.to(channelId).emit('floor_granted', {
          userId: user.userId,
          name: user.userName,
          role: user.role
        });

        // Wake up offline users
        const offlineTokens = await getOfflineMemberTokens(channelId, user.userId);
        if (offlineTokens.length > 0) {
          await sendBroadcastWakeUp(channelId, user.userName, user.role, offlineTokens);
        }

        // Log
        socket.data.currentLogId = await logTalkStart(channelId, user.userId, user.userName, 'Channel', 'COMMON');

      } else {
        socket.emit('floor_denied', { reason: result.reason, currentHolder: getFloorState(channelId).currentSpeaker?.userName });
      }
    });

    socket.on('release_floor', async (channelId: string) => {
      if (releaseFloor(channelId, socket.id)) {
        io.to(channelId).emit('floor_released');
        
        if (socket.data.currentLogId) {
          await logTalkEnd(socket.data.currentLogId, Date.now());
          socket.data.currentLogId = null;
        }
      }
    });

    // WebRTC Signaling
    socket.on('offer', ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit('offer', { from: socket.id, offer });
    });

    socket.on('answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('answer', { from: socket.id, answer });
    });

    socket.on('ice-candidate', ({ targetSocketId, channelId, candidate }) => {
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice-candidate', { from: socket.id, candidate });
      } else if (channelId) {
        socket.to(channelId).emit('ice-candidate', { from: socket.id, candidate });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${user.userName}`);
      const leftChannels = leaveAllChannels(socket.id);
      removeUserSocket(user.userId, socket.id);
      
      for (const channelId of leftChannels) {
        if (releaseFloor(channelId, socket.id)) {
          io.to(channelId).emit('floor_released');
          if (socket.data.currentLogId) {
            await logTalkEnd(socket.data.currentLogId, Date.now());
          }
        }
        if (!isUserInChannel(channelId, user.userId)) {
          if (user.isBusy) {
            io.to(channelId).emit('user_status', {
              userId: user.userId,
              isBusy: true
            });
            const existingTimer = busyDisconnectGraceTimers.get(user.userId);
            if (existingTimer) clearTimeout(existingTimer);
            const timer = setTimeout(() => {
              io.to(channelId).emit('user_left', { userId: user.userId });
              busyDisconnectGraceTimers.delete(user.userId);
            }, 2 * 60 * 1000);
            busyDisconnectGraceTimers.set(user.userId, timer);
            continue;
          }
          io.to(channelId).emit('user_left', { userId: user.userId });
        }
      }

      if (!user.isDeviceAuth) {
        await updateUserOnlineStatus(user.userId, false);
      }
    });
  });

  // Check timeouts
  setInterval(() => {
    const timeouts = checkFloorTimeouts();
    for (const timeout of timeouts) {
      io.to(timeout.channelId).emit('floor_released');
      const socket = io.sockets.sockets.get(timeout.socketId);
      if (socket && socket.data.currentLogId) {
        logTalkEnd(socket.data.currentLogId, Date.now()).catch(console.error);
        socket.data.currentLogId = null;
      }
    }
  }, 5000);
}
