export interface AudioRelayPayload {
  channelId?: string;
  targetUserId?: string;
  audio: string;
  sampleRate?: number;
  sequence?: number;
}

export interface AudioRelaySender {
  userId: string;
  userName: string;
}

export interface AudioRelayEvent {
  channelId?: string;
  targetUserId?: string;
  audio: string;
  sampleRate: number;
  sequence: number;
  fromUserId: string;
  fromUserName: string;
}

export function buildAudioRelayEvent(
  payload: AudioRelayPayload,
  sender: AudioRelaySender
): AudioRelayEvent {
  return {
    channelId: payload.channelId,
    targetUserId: payload.targetUserId,
    audio: payload.audio,
    sampleRate: payload.sampleRate || 16000,
    sequence: payload.sequence || 0,
    fromUserId: sender.userId,
    fromUserName: sender.userName
  };
}
