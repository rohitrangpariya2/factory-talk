import { db } from '../config/firebase';
import { TalkLog } from '../types';

export async function logTalkStart(
  channelId: string,
  userId: string,
  userName: string,
  channelName: string,
  type: TalkLog['type']
): Promise<string> {
  const logRef = db.collection('talkLogs').doc();
  const log: TalkLog = {
    channelId,
    userId,
    userName,
    channelName,
    startTime: Date.now(),
    type
  };
  
  await logRef.set(log);
  return logRef.id;
}

export async function logTalkEnd(logId: string, endTime: number): Promise<void> {
  const logRef = db.collection('talkLogs').doc(logId);
  const doc = await logRef.get();
  
  if (doc.exists) {
    const data = doc.data() as TalkLog;
    const duration = endTime - data.startTime;
    await logRef.update({
      endTime,
      duration
    });
  }
}

export async function getTalkLogs(channelId?: string, userId?: string, limit: number = 50): Promise<TalkLog[]> {
  let query: FirebaseFirestore.Query = db.collection('talkLogs');
  
  if (channelId) {
    query = query.where('channelId', '==', channelId);
  }
  if (userId) {
    query = query.where('userId', '==', userId);
  }
  
  query = query.orderBy('startTime', 'desc').limit(limit);
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as TalkLog);
}
