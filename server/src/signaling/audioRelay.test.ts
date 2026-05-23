import { buildAudioRelayEvent } from './audioRelay';

describe('buildAudioRelayEvent', () => {
  it('keeps only relay-safe audio fields and sender metadata', () => {
    const event = buildAudioRelayEvent(
      ({
        channelId: 'general',
        targetUserId: 'worker-1',
        audio: 'abc123',
        sampleRate: 16000,
        sequence: 7,
        ignored: 'nope'
      } as any),
      {
        userId: 'owner-1',
        userName: 'Owner'
      }
    );

    expect(event).toEqual({
      channelId: 'general',
      targetUserId: 'worker-1',
      audio: 'abc123',
      sampleRate: 16000,
      sequence: 7,
      fromUserId: 'owner-1',
      fromUserName: 'Owner'
    });
  });
});
