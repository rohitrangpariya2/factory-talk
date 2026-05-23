# Free Render Deploy

This project can use Render's free web service for mobile-to-mobile testing.

## Required Render Environment Variables

Set these on the Render web service:

```text
NODE_ENV=production
PORT=10000
FIREBASE_PROJECT_ID=factory-talk
ALLOW_DEVICE_AUTH=true
STUN_SERVER=stun:stun.l.google.com:19302
FIREBASE_SERVICE_ACCOUNT_JSON=<paste the full Firebase service-account JSON on one line>
```

Do not commit service-account JSON files. Paste the JSON only into Render's secret environment variable field.

## After Render Deploys

Render gives a URL like:

```text
https://factory-talk-server-xxxx.onrender.com
```

Build the APK with that URL:

```powershell
cd "C:\Users\PC\Downloads\Factory talk\android"
$env:JAVA_HOME=(Resolve-Path '..\jdk-17.0.11+9').Path
.\gradle_dist\gradle-8.7\bin\gradle.bat :app:assembleDebug -PSERVER_URL=https://factory-talk-server-xxxx.onrender.com
```

The APK will be here:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```
