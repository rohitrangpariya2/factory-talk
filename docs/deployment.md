# Deployment Guide

## Production Environment Checklist
- [ ] Use a dedicated VPS (DigitalOcean/AWS/Linode).
- [ ] Setup SSL/TLS for the Node.js server.
- [ ] Deploy Coturn for production STUN/TURN.
- [ ] Update Android app `SERVER_URL` to the production domain.
- [ ] Secure Firestore rules.

## Deploying Node.js Server
1. Clone the repository to your VPS.
2. Install Node.js 20.
3. Run `npm install`.
4. Build the TypeScript code: `npm run build`.
5. Set up PM2 for process management: `npm install -g pm2`.
6. Start the server: `pm2 start dist/index.js --name "factory-talk-server"`.
7. Configure Nginx as a reverse proxy to route traffic to port `3000`.

## Coturn Setup with Docker
1. Install Docker on the VPS.
2. Run the Coturn container:
```bash
docker run -d --network=host --name coturn \
  coturn/coturn \
  -n --log-file=stdout \
  --min-port=49152 \
  --max-port=65535 \
  --realm=yourdomain.com \
  --user=username:password \
  --lt-cred-mech \
  --fingerprint
```
3. Update the Android `WebRTCManager.kt` and Node.js `.env` with the Coturn credentials.

## Android App Deployment
1. Generate a signed APK/AAB from Android Studio.
2. Test the signed build thoroughly.
3. Distribute the APK directly to workers or publish to the Google Play Store (Internal Testing track recommended for private factory apps).
