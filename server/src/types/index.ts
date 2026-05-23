export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  SUPERVISOR = 'SUPERVISOR',
  WORKER = 'WORKER'
}

export const RolePriority: Record<UserRole, number> = {
  [UserRole.OWNER]: 4,
  [UserRole.ADMIN]: 3,
  [UserRole.SUPERVISOR]: 2,
  [UserRole.WORKER]: 1
};

export interface User {
  id: string;
  phoneNumber: string;
  displayName: string;
  role: UserRole;
  fcmToken?: string;
  isOnline: boolean;
  lastSeen: number;
  channels: string[];
  permissions: {
    canTalk: boolean;
    canPrivateTalk: boolean;
  };
  isMuted: boolean;
  isBlocked: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: 'COMMON' | 'DEPARTMENT';
  department?: string;
  members: string[];
  createdBy: string;
}

export interface FloorState {
  channelId: string;
  currentSpeaker: {
    socketId: string;
    userId: string;
    userName: string;
    role: UserRole;
    priority: number;
    startTime: number;
  } | null;
  maxDuration: number;
}

export interface FloorResult {
  granted: boolean;
  reason?: string;
  overriddenUser?: {
    userId: string;
    socketId: string;
  };
}

export interface ConnectedUser {
  socketId: string;
  userId: string;
  userName: string;
  role: UserRole;
  fcmToken?: string;
  isDeviceAuth?: boolean;
}

export interface TalkLog {
  channelId: string;
  userId: string;
  userName: string;
  channelName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  type: 'COMMON' | 'DEPARTMENT' | 'PRIVATE' | 'EMERGENCY';
}
