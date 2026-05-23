# Factory Talk

A modern Push-to-Talk (Walkie Talkie) Android application designed specifically for factory environments.

## Architecture
```mermaid
graph TD
    Client1[Android Client 1] -->|WebSocket| NodeServer[Node.js Signaling Server]
    Client2[Android Client 2] -->|WebSocket| NodeServer
    NodeServer -->|FCM Push| Firebase[Firebase]
    Firebase -->|Wake up| Client2
    Client1 <-->|WebRTC Audio| Client2
```

## Tech Stack
- **Android App:** Kotlin, Jetpack Compose, Hilt, Coroutines
- **Signaling Server:** Node.js, Socket.IO, TypeScript
- **Backend/Auth:** Firebase Authentication (Phone), Firestore
- **Audio Engine:** WebRTC (`io.getstream:stream-webrtc-android`)
- **Push Notifications:** Firebase Cloud Messaging (FCM)

## Project Structure
- `/android` - Android App source code.
- `/server` - Node.js Signaling Server source code.
- `/docs` - Setup and Deployment guides.
- `/firebase` - Firebase configuration and rules.

## Setup Instructions
See `/docs/setup-guide.md` for detailed instructions on how to run this project.
