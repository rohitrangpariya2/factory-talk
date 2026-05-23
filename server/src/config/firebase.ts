import * as admin from 'firebase-admin';
import fs from 'fs';
import { env } from './env';

if (!admin.apps.length) {
  let credential: admin.credential.Credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  } else if (env.googleAppCreds && fs.existsSync(env.googleAppCreds)) {
    credential = admin.credential.cert(JSON.parse(fs.readFileSync(env.googleAppCreds, 'utf8')));
  } else {
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    credential,
    projectId: env.firebaseProjectId
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
export const messaging = admin.messaging();
