import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  port: process.env.PORT || 3000,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  googleAppCreds: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  stunServer: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302',
  turnServer: process.env.TURN_SERVER,
  turnUsername: process.env.TURN_USERNAME,
  turnPassword: process.env.TURN_PASSWORD,
  allowDeviceAuth: process.env.ALLOW_DEVICE_AUTH === 'true',
  adminSecret: process.env.ADMIN_SECRET
};
