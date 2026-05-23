import { ConnectedUser } from '../types';

interface ChannelData {
  members: Map<string, ConnectedUser>; // socketId -> ConnectedUser
  channelName: string;
}

const channels = new Map<string, ChannelData>();
const userSockets = new Map<string, string>(); // userId -> socketId

export function joinChannel(channelId: string, socketId: string, user: ConnectedUser, channelName: string = 'Channel'): void {
  if (!channels.has(channelId)) {
    channels.set(channelId, { members: new Map(), channelName });
  }
  channels.get(channelId)!.members.set(socketId, user);
  userSockets.set(user.userId, socketId);
}

export function leaveChannel(channelId: string, socketId: string): void {
  const channel = channels.get(channelId);
  if (channel) {
    channel.members.delete(socketId);
    if (channel.members.size === 0) {
      channels.delete(channelId);
    }
  }
}

export function leaveAllChannels(socketId: string): string[] {
  const leftChannels: string[] = [];
  for (const [channelId, channel] of channels.entries()) {
    if (channel.members.has(socketId)) {
      channel.members.delete(socketId);
      leftChannels.push(channelId);
      if (channel.members.size === 0) {
        channels.delete(channelId);
      }
    }
  }
  return leftChannels;
}

export function getChannelMembers(channelId: string): ConnectedUser[] {
  const channel = channels.get(channelId);
  if (!channel) return [];
  return Array.from(channel.members.values());
}

export function getOnlineUsers(): ConnectedUser[] {
  const users = new Map<string, ConnectedUser>();
  for (const channel of channels.values()) {
    for (const user of channel.members.values()) {
      users.set(user.userId, user);
    }
  }
  return Array.from(users.values());
}

export function getUserChannels(socketId: string): string[] {
  const userChannels: string[] = [];
  for (const [channelId, channel] of channels.entries()) {
    if (channel.members.has(socketId)) {
      userChannels.push(channelId);
    }
  }
  return userChannels;
}

export function isUserInChannel(channelId: string, userId: string): boolean {
  const channel = channels.get(channelId);
  if (!channel) return false;
  for (const member of channel.members.values()) {
    if (member.userId === userId) return true;
  }
  return false;
}

export function getSocketIdByUserId(userId: string): string | undefined {
  return userSockets.get(userId);
}

export function removeUserSocket(userId: string): void {
  userSockets.delete(userId);
}
