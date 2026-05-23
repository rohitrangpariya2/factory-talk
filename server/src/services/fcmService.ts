import { messaging } from '../config/firebase';
import { UserRole } from '../types';

export async function sendBroadcastWakeUp(
  channelId: string,
  speakerName: string,
  speakerRole: UserRole,
  fcmTokens: string[]
): Promise<void> {
  if (!fcmTokens.length) return;

  const message = {
    data: {
      type: 'incoming_ptt',
      channel_id: channelId,
      speaker_name: speakerName,
      speaker_role: speakerRole
    },
    android: {
      priority: 'high' as const,
      ttl: 0, // Deliver immediately or discard
    },
    tokens: fcmTokens
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    if (response.failureCount > 0) {
      // TODO: Handle invalid tokens and clean them up from DB
      console.log(`Failed to send ${response.failureCount} wake-up messages.`);
    }
  } catch (error) {
    console.error('Error sending multicast message:', error);
  }
}

export async function sendPrivateTalkNotification(
  targetToken: string,
  callerName: string,
  callerId: string
): Promise<void> {
  const message = {
    data: {
      type: 'private_talk',
      caller_name: callerName,
      caller_id: callerId
    },
    android: {
      priority: 'high' as const,
      ttl: 0,
    },
    token: targetToken
  };

  try {
    await messaging.send(message);
  } catch (error) {
    console.error('Error sending private talk notification:', error);
  }
}

export async function sendEmergencyBroadcast(
  channelId: string,
  senderName: string,
  fcmTokens: string[]
): Promise<void> {
  if (!fcmTokens.length) return;

  const message = {
    data: {
      type: 'emergency',
      channel_id: channelId,
      speaker_name: senderName
    },
    android: {
      priority: 'high' as const,
      ttl: 0,
    },
    tokens: fcmTokens
  };

  try {
    await messaging.sendEachForMulticast(message);
  } catch (error) {
    console.error('Error sending emergency broadcast:', error);
  }
}
