# API Reference

## Socket.IO Events

### Client to Server
* `join_channel` - payload: `channelId: string`
* `leave_channel` - payload: `channelId: string`
* `request_floor` - payload: `channelId: string`
* `release_floor` - payload: `channelId: string`
* `offer` - payload: `{ targetSocketId: string, offer: RTCSessionDescription }`
* `answer` - payload: `{ targetSocketId: string, answer: RTCSessionDescription }`
* `ice-candidate` - payload: `{ targetSocketId: string?, channelId: string, candidate: RTCIceCandidate }`

### Server to Client
* `floor_granted` - payload: `{ userId: string, name: string, role: string }`
* `floor_denied` - payload: `{ reason: string, currentHolder: string? }`
* `floor_released` - no payload
* `floor_revoked` - payload: `{ reason: string }`
* `user_joined` - payload: `{ userId: string, name: string }`
* `user_left` - payload: `{ userId: string }`
* `channel_info` - payload: `{ members: Array<Object>, floorHolder: Object? }`
* `offer` - payload: `{ from: string, offer: Object }`
* `answer` - payload: `{ from: string, answer: Object }`
* `ice-candidate` - payload: `{ from: string, candidate: Object }`

## REST API

*Authentication:* All endpoints require a Firebase ID token in the `Authorization: Bearer <token>` header.

* `GET /api/users` - Get all users
* `GET /api/channels` - Get all accessible channels
* `POST /api/channels` - Create a new channel (Admin only)
* `PUT /api/users/:id/role` - Update user role (Owner only)
