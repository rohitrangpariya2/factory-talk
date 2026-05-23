import { Server, Socket } from 'socket.io';
import { ConnectedUser, UserRole } from '../types';
import { auth } from '../config/firebase';
import { env } from '../config/env';
import { getUserById, updateUserOnlineStatus, updateFcmToken, getOfflineMemberTokens } from '../services/userService';
import { joinChannel, leaveChannel, leaveAllChannels, getChannelMembers, getSocketIdByUserId, removeUserSocket } from './roomManager';
import { requestFloor, releaseFloor, getFloorState, checkFloorTimeouts } from './floorControl';
import { sendBroadcastWakeUp } from '../services/fcmService';
import { logTalkStart, logTalkEnd } from '../services/logService';
import { buildAudioRelayEvent } from './audioRelay';

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
        fcmToken: user.fcmToken
      } as ConnectedUser;
      
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user: ConnectedUser = socket.data.user;
    console.log(`User connected: ${user.userName} (${socket.id})`);

    if (!user.isDeviceAuth) {
      await updateUserOnlineStatus(user.userId, true);
    }
    
    // Auto-join common channel
    socket.emit('connected', { userId: user.userId });

    socket.on('join_channel', (channelId: string) => {
      socket.join(channelId);
      joinChannel(channelId, socket.id, user);
      
      const members = getChannelMembers(channelId);
      const floorState = getFloorState(channelId);
      
      socket.emit('channel_info', { members, floorHolder: floorState.currentSpeaker });
      socket.to(channelId).emit('user_joined', { userId: user.userId, name: user.userName });
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
      
      socket.to(channelId).emit('user_left', { userId: user.userId });
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
      removeUserSocket(user.userId);
      
      for (const channelId of leftChannels) {
        if (releaseFloor(channelId, socket.id)) {
          io.to(channelId).emit('floor_released');
          if (socket.data.currentLogId) {
            await logTalkEnd(socket.data.currentLogId, Date.now());
          }
        }
        io.to(channelId).emit('user_left', { userId: user.userId });
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
