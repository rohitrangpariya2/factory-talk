# Factory Talk Setup Guide

## Prerequisites
- Node.js 20+
- Android Studio Jellyfish (or later)
- Firebase CLI (`npm install -g firebase-tools`)

## 1. Firebase Project Setup
1. Go to Firebase Console and create a new project.
2. Enable **Authentication** and turn on the **Phone** sign-in provider.
3. Enable **Firestore Database** in test mode initially.
4. Enable **Firebase Cloud Messaging**.
5. Add an Android app (`com.factorytalk.app`) to the project.
6. Download the `google-services.json` file.
7. Go to Project Settings > Service Accounts and generate a new private key. Download the JSON file for the server.

## 2. Server Setup
1. Navigate to the `server` directory.
2. Run `npm install`
3. Copy `.env.example` to `.env`
4. Set the `FIREBASE_PROJECT_ID` in `.env`
5. Place your downloaded Firebase service account JSON file in the server directory and name it `service-account.json`. Update the `GOOGLE_APPLICATION_CREDENTIALS` path in `.env` to point to it.
6. Run `npm run dev` to start the development server.

## 3. Android App Setup
1. Open the `android` folder in Android Studio.
2. Place the `google-services.json` file in `android/app/`.
3. Open `android/app/src/main/java/com/factorytalk/app/util/Constants.kt` and update `SERVER_URL` to point to your local machine's IP (or `10.0.2.2` if using the emulator).
4. Run Gradle sync.
5. Build and run the app.

## 4. TURN/STUN Server Setup (Development)
For local development, the app uses Google's public STUN servers and a free TURN server (Metered). For production, you will need to set up Coturn.

## 5. Testing Guide
1. Run the Node.js server.
2. Launch the app on two different physical Android devices (or emulators, though emulators might have audio routing issues).
3. Sign in with phone numbers.
4. Press the "HOLD TO TALK" button on one device. The other device should instantly hear the audio.

## Troubleshooting
- **Cannot connect to server:** Ensure your Android device and development machine are on the same WiFi network and the IP address in `Constants.kt` is correct. Check Windows Firewall.
- **No audio:** Ensure you have granted microphone permissions and are not muted.
- **Background calls not waking device:** Check the Setup Guide in the app to disable battery optimizations. Ensure FCM push notifications are being sent from the server.
