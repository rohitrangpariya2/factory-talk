import { db } from '../config/firebase';
import { User, UserRole } from '../types';

export async function getUserById(userId: string): Promise<User | null> {
  const doc = await db.collection('users').doc(userId).get();
  if (!doc.exists) return null;
  return doc.data() as User;
}

export async function updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
  await db.collection('users').doc(userId).update({
    isOnline,
    lastSeen: Date.now()
  });
}

export async function updateFcmToken(userId: string, token: string): Promise<void> {
  await db.collection('users').doc(userId).update({
    fcmToken: token
  });
}

export async function getUsersByChannel(channelId: string): Promise<User[]> {
  // First get common channels if this is a common channel
  const channelDoc = await db.collection('channels').doc(channelId).get();
  if (!channelDoc.exists) return [];
  
  const channelData = channelDoc.data();
  if (channelData?.type === 'COMMON') {
    const snapshot = await db.collection('users').get();
    return snapshot.docs.map(doc => doc.data() as User);
  }
  
  // For department channels, get members
  const snapshot = await db.collection('users')
    .where('channels', 'array-contains', channelId)
    .get();
  return snapshot.docs.map(doc => doc.data() as User);
}

export async function getOfflineMemberTokens(channelId: string, excludeUserId: string): Promise<string[]> {
  const users = await getUsersByChannel(channelId);
  return users
    .filter(u => u.id !== excludeUserId && !u.isOnline && !!u.fcmToken)
    .map(u => u.fcmToken!);
}

export async function getAllUsers(): Promise<User[]> {
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map(doc => doc.data() as User);
}

export async function updateUserRole(userId: string, role: UserRole, updatedBy: string): Promise<void> {
  await db.collection('users').doc(userId).update({ role });
}
