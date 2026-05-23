import { FloorState, UserRole, RolePriority, FloorResult } from '../types';

const floorStates = new Map<string, FloorState>();

export const MAX_TALK_DURATION_MS = 60000; // 60 seconds

export function getFloorState(channelId: string): FloorState {
  if (!floorStates.has(channelId)) {
    floorStates.set(channelId, {
      channelId,
      currentSpeaker: null,
      maxDuration: MAX_TALK_DURATION_MS
    });
  }
  return floorStates.get(channelId)!;
}

export function requestFloor(
  channelId: string,
  socketId: string,
  userId: string,
  userName: string,
  role: UserRole
): FloorResult {
  const state = getFloorState(channelId);
  const priority = RolePriority[role];
  const now = Date.now();

  if (!state.currentSpeaker) {
    state.currentSpeaker = { socketId, userId, userName, role, priority, startTime: now };
    return { granted: true };
  }

  if (state.currentSpeaker.userId === userId) {
    return { granted: true }; // Already holds the floor
  }

  if (priority > state.currentSpeaker.priority) {
    const overriddenUser = {
      userId: state.currentSpeaker.userId,
      socketId: state.currentSpeaker.socketId
    };
    state.currentSpeaker = { socketId, userId, userName, role, priority, startTime: now };
    return { granted: true, overriddenUser };
  }

  return { granted: false, reason: 'Channel is busy and your priority is too low.' };
}

export function releaseFloor(channelId: string, socketId: string): boolean {
  const state = floorStates.get(channelId);
  if (state && state.currentSpeaker?.socketId === socketId) {
    state.currentSpeaker = null;
    return true;
  }
  return false;
}

export function releaseFloorByUserId(channelId: string, userId: string): boolean {
  const state = floorStates.get(channelId);
  if (state && state.currentSpeaker?.userId === userId) {
    state.currentSpeaker = null;
    return true;
  }
  return false;
}

export function checkFloorTimeouts(): Array<{ channelId: string; socketId: string }> {
  const timeouts: Array<{ channelId: string; socketId: string }> = [];
  const now = Date.now();
  
  for (const [channelId, state] of floorStates.entries()) {
    if (state.currentSpeaker && (now - state.currentSpeaker.startTime > state.maxDuration)) {
      timeouts.push({
        channelId,
        socketId: state.currentSpeaker.socketId
      });
      state.currentSpeaker = null;
    }
  }
  return timeouts;
}
