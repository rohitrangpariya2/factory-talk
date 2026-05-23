package com.factorytalk.app.data.remote

import android.util.Log
import com.factorytalk.app.data.model.ConnectionState
import com.factorytalk.app.data.model.UserRole
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription
import java.net.URI

class SignalingClient {
    private var socket: Socket? = null
    
    private val _events = MutableSharedFlow<SignalingEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<SignalingEvent> = _events.asSharedFlow()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    fun connect(serverUrl: String, authToken: String?, userId: String, userName: String, role: UserRole) {
        if (socket?.connected() == true) return
        
        _connectionState.value = ConnectionState.CONNECTING
        
        try {
            val options = IO.Options().apply {
                val authPayload = mutableMapOf(
                    "deviceId" to userId,
                    "role" to role.name,
                    "name" to userName
                )
                authToken?.let { authPayload["token"] = it }
                auth = authPayload
                reconnection = true
                reconnectionAttempts = Int.MAX_VALUE
                reconnectionDelay = 1000
                reconnectionDelayMax = 5000
            }

            socket = IO.socket(URI.create(serverUrl), options).apply {
                on(Socket.EVENT_CONNECT) { 
                    _connectionState.value = ConnectionState.CONNECTED
                    _events.tryEmit(SignalingEvent.Connected) 
                }
                on(Socket.EVENT_DISCONNECT) { 
                    _connectionState.value = ConnectionState.DISCONNECTED
                    _events.tryEmit(SignalingEvent.Disconnected) 
                }
                on(Socket.EVENT_CONNECT_ERROR) { args ->
                    _connectionState.value = ConnectionState.RECONNECTING
                    val errorMsg = args.firstOrNull()?.toString() ?: "Unknown error"
                    _events.tryEmit(SignalingEvent.Error(errorMsg))
                }
                
                // Floor Control Events
                on("floor_granted") { args ->
                    val data = args[0] as JSONObject
                    _events.tryEmit(SignalingEvent.FloorGranted(
                        userId = data.getString("userId"),
                        name = data.getString("name"),
                        role = UserRole.valueOf(data.getString("role"))
                    ))
                }
                on("floor_denied") { args ->
                    val data = args[0] as JSONObject
                    _events.tryEmit(SignalingEvent.FloorDenied(
                        reason = data.getString("reason"),
                        currentHolder = data.optString("currentHolder")
                    ))
                }
                on("floor_released") { _events.tryEmit(SignalingEvent.FloorReleased) }
                on("floor_revoked") { args ->
                    val data = args[0] as JSONObject
                    _events.tryEmit(SignalingEvent.FloorRevoked(data.getString("reason")))
                }
                
                // WebRTC Events
                on("offer") { args ->
                    val data = args[0] as JSONObject
                    val offerJson = data.getJSONObject("offer")
                    val offer = SessionDescription(
                        SessionDescription.Type.fromCanonicalForm(offerJson.getString("type")),
                        offerJson.getString("sdp")
                    )
                    _events.tryEmit(SignalingEvent.OfferReceived(data.getString("from"), offer))
                }
                on("answer") { args ->
                    val data = args[0] as JSONObject
                    val answerJson = data.getJSONObject("answer")
                    val answer = SessionDescription(
                        SessionDescription.Type.fromCanonicalForm(answerJson.getString("type")),
                        answerJson.getString("sdp")
                    )
                    _events.tryEmit(SignalingEvent.AnswerReceived(data.getString("from"), answer))
                }
                on("ice-candidate") { args ->
                    val data = args[0] as JSONObject
                    val candJson = data.getJSONObject("candidate")
                    val candidate = IceCandidate(
                        candJson.getString("sdpMid"),
                        candJson.getInt("sdpMLineIndex"),
                        candJson.getString("candidate")
                    )
                    _events.tryEmit(SignalingEvent.IceCandidateReceived(data.getString("from"), candidate))
                }

                on("audio_chunk") { args ->
                    val data = args[0] as JSONObject
                    _events.tryEmit(SignalingEvent.AudioChunkReceived(
                        fromUserId = data.getString("fromUserId"),
                        fromUserName = data.getString("fromUserName"),
                        audio = data.getString("audio"),
                        sampleRate = data.optInt("sampleRate", 16000),
                        sequence = data.optInt("sequence", 0)
                    ))
                }
                
                // Room Events
                on("user_joined") { args ->
                    val data = args[0] as JSONObject
                    _events.tryEmit(SignalingEvent.UserJoined(
                        userId = data.getString("userId"),
                        name = data.getString("name"),
                        role = UserRole.valueOf(data.optString("role", UserRole.WORKER.name))
                    ))
                }
                on("user_left") { args ->
                    val data = args[0] as JSONObject
                    _events.tryEmit(SignalingEvent.UserLeft(data.getString("userId")))
                }
                on("channel_info") { args ->
                    val data = args[0] as JSONObject
                    val membersArray = data.getJSONArray("members")
                    val members = mutableListOf<JSONObject>()
                    for (i in 0 until membersArray.length()) {
                        members.add(membersArray.getJSONObject(i))
                    }
                    val floorHolder = if (data.isNull("floorHolder")) null else data.getJSONObject("floorHolder")
                    _events.tryEmit(SignalingEvent.ChannelInfo(members, floorHolder))
                }
                
                connect()
            }
        } catch (e: Exception) {
            _connectionState.value = ConnectionState.DISCONNECTED
            _events.tryEmit(SignalingEvent.Error(e.message ?: "Failed to connect"))
            Log.e("SignalingClient", "Connect error", e)
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    fun joinChannel(channelId: String) {
        socket?.emit("join_channel", channelId)
    }

    fun leaveChannel(channelId: String) {
        socket?.emit("leave_channel", channelId)
    }

    fun requestFloor(channelId: String) {
        socket?.emit("request_floor", channelId)
    }

    fun releaseFloor(channelId: String) {
        socket?.emit("release_floor", channelId)
    }

    fun sendOffer(targetSocketId: String, offer: JSONObject) {
        socket?.emit("offer", JSONObject().apply {
            put("targetSocketId", targetSocketId)
            put("offer", offer)
        })
    }

    fun sendAnswer(targetSocketId: String, answer: JSONObject) {
        socket?.emit("answer", JSONObject().apply {
            put("targetSocketId", targetSocketId)
            put("answer", answer)
        })
    }

    fun sendIceCandidate(targetSocketId: String?, channelId: String, candidate: JSONObject) {
        socket?.emit("ice-candidate", JSONObject().apply {
            put("targetSocketId", targetSocketId)
            put("channelId", channelId)
            put("candidate", candidate)
        })
    }

    fun sendAudioChunk(channelId: String?, targetUserId: String?, audio: String, sampleRate: Int, sequence: Int) {
        socket?.emit("audio_chunk", JSONObject().apply {
            channelId?.let { put("channelId", it) }
            targetUserId?.let { put("targetUserId", it) }
            put("audio", audio)
            put("sampleRate", sampleRate)
            put("sequence", sequence)
        })
    }
}

sealed class SignalingEvent {
    object Connected : SignalingEvent()
    object Disconnected : SignalingEvent()
    object Reconnecting : SignalingEvent()
    
    data class FloorGranted(val userId: String, val name: String, val role: UserRole) : SignalingEvent()
    data class FloorDenied(val reason: String, val currentHolder: String?) : SignalingEvent()
    object FloorReleased : SignalingEvent()
    data class FloorRevoked(val reason: String) : SignalingEvent()
    
    data class OfferReceived(val fromSocketId: String, val offer: SessionDescription) : SignalingEvent()
    data class AnswerReceived(val fromSocketId: String, val answer: SessionDescription) : SignalingEvent()
    data class IceCandidateReceived(val fromSocketId: String, val candidate: IceCandidate) : SignalingEvent()
    data class AudioChunkReceived(
        val fromUserId: String,
        val fromUserName: String,
        val audio: String,
        val sampleRate: Int,
        val sequence: Int
    ) : SignalingEvent()
    
    data class UserJoined(val userId: String, val name: String, val role: UserRole) : SignalingEvent()
    data class UserLeft(val userId: String) : SignalingEvent()
    data class ChannelInfo(val members: List<JSONObject>, val floorState: JSONObject?) : SignalingEvent()
    
    data class Error(val message: String) : SignalingEvent()
}
