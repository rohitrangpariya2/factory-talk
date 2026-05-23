package com.factorytalk.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.factorytalk.app.MainActivity
import com.factorytalk.app.R
import com.factorytalk.app.audio.AudioRouteManager
import com.factorytalk.app.audio.FloorControlManager
import com.factorytalk.app.audio.RelayAudioManager
import com.factorytalk.app.audio.WebRTCManager
import com.factorytalk.app.data.model.UserRole
import com.factorytalk.app.data.remote.SignalingClient
import com.factorytalk.app.data.repository.AuthRepository
import com.factorytalk.app.data.repository.UserRepository
import com.factorytalk.app.util.Constants
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch
import org.webrtc.PeerConnection
import javax.inject.Inject

@AndroidEntryPoint
class TalkForegroundService : Service() {

    @Inject lateinit var webRTCManager: WebRTCManager
    @Inject lateinit var signalingClient: SignalingClient
    @Inject lateinit var floorControlManager: FloorControlManager
    @Inject lateinit var audioRouteManager: AudioRouteManager
    @Inject lateinit var relayAudioManager: RelayAudioManager
    @Inject lateinit var authRepository: AuthRepository
    @Inject lateinit var userRepository: UserRepository
    @Inject lateinit var connectionWatchdog: ConnectionWatchdog

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var wakeLock: PowerManager.WakeLock? = null
    private var isServiceRunning = false
    private var currentChannelId: String? = null
    private var targetUserId: String? = null
    private var currentUserId: String? = null
    private var currentUserName: String? = null
    private var currentUserRole: UserRole = UserRole.WORKER

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "FactoryTalk::PttWakeLock"
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_STICKY
        
        if (!isServiceRunning && action != Constants.ACTION_STOP_SERVICE) {
            startForegroundServiceWithNotification()
            isServiceRunning = true
            connectionWatchdog.start()
            initializeSignaling()
        }
        
        when (action) {
            Constants.ACTION_START_SERVICE -> {
                // Just starting normally
                updateNotification("Connected - Listening")
            }
            Constants.ACTION_STOP_SERVICE -> {
                stopForegroundService()
            }
            Constants.ACTION_INCOMING_BROADCAST -> {
                // Woken up by FCM for incoming talk
                val channelId = intent.getStringExtra(Constants.EXTRA_CHANNEL_ID)
                val speakerName = intent.getStringExtra(Constants.EXTRA_SPEAKER_NAME)
                
                wakeLock?.acquire(10 * 60 * 1000L) /*10 minutes*/
                
                updateNotification("Receiving broadcast from $speakerName")
                
                channelId?.let { 
                    currentChannelId = it
                    if (signalingClient.connectionState.value == com.factorytalk.app.data.model.ConnectionState.CONNECTED) {
                        signalingClient.joinChannel(it)
                    }
                }
            }
            Constants.ACTION_JOIN_CHANNEL -> {
                val channelId = intent.getStringExtra(Constants.EXTRA_CHANNEL_ID)
                targetUserId = intent.getStringExtra(Constants.EXTRA_TARGET_USER_ID)
                channelId?.let {
                    currentChannelId = it
                    signalingClient.joinChannel(it)
                    updateNotification("Connected to Channel")
                }
            }
            Constants.ACTION_LEAVE_CHANNEL -> {
                currentChannelId?.let { signalingClient.leaveChannel(it) }
                currentChannelId = null
                updateNotification("Idle")
            }
            Constants.ACTION_START_TALKING -> {
                targetUserId = intent.getStringExtra(Constants.EXTRA_TARGET_USER_ID) ?: targetUserId
                currentChannelId?.let { 
                    if (Constants.DEMO_MODE && currentUserId != null && currentUserName != null) {
                        floorControlManager.handleFloorGranted(
                            userId = currentUserId!!,
                            name = currentUserName!!,
                            role = currentUserRole,
                            currentUserId = currentUserId!!,
                            channelId = it
                        )
                    } else {
                        floorControlManager.requestFloor(it)
                    }
                    relayAudioManager.startBroadcast(it, targetUserId)
                    updateNotification("Talking...")
                }
            }
            Constants.ACTION_STOP_TALKING -> {
                currentChannelId?.let { 
                    floorControlManager.releaseFloor(it) 
                    relayAudioManager.stopBroadcast()
                    updateNotification("Connected - Listening")
                }
            }
        }
        
        return START_STICKY
    }

    private fun initializeSignaling() {
        serviceScope.launch {
            val user = userRepository.getCurrentUser().firstOrNull() ?: return@launch
            currentUserId = user.id
            currentUserName = user.displayName
            currentUserRole = user.role

            if (Constants.DEMO_MODE) {
                currentChannelId = currentChannelId ?: Constants.DEMO_CHANNEL_ID
            }

            val token = if (Constants.DEMO_MODE) null else authRepository.getIdToken() ?: return@launch
            
            signalingClient.connect(
                serverUrl = Constants.SERVER_URL,
                authToken = token,
                userId = user.id,
                userName = user.displayName,
                role = user.role
            )
            
            // Re-join channel if we were in one before
            currentChannelId?.let { signalingClient.joinChannel(it) }
            
            // Listen to signaling events
            signalingClient.events.collect { event ->
                handleSignalingEvent(event, user.id)
            }
        }
    }

    private fun handleSignalingEvent(event: com.factorytalk.app.data.remote.SignalingEvent, currentUserId: String) {
        when (event) {
            is com.factorytalk.app.data.remote.SignalingEvent.FloorGranted -> {
                floorControlManager.handleFloorGranted(
                    userId = event.userId,
                    name = event.name,
                    role = event.role,
                    currentUserId = currentUserId,
                    channelId = currentChannelId ?: ""
                )
                if (event.userId == currentUserId) {
                    audioRouteManager.requestAudioFocus()
                    // Setup audio track if we are the ones talking
                    if (!Constants.DEMO_MODE && !webRTCManager.createAudioTrack().enabled()) {
                        webRTCManager.setMicEnabled(true)
                    }
                }
            }
            is com.factorytalk.app.data.remote.SignalingEvent.FloorDenied -> {
                floorControlManager.handleFloorDenied(event.reason)
            }
            is com.factorytalk.app.data.remote.SignalingEvent.FloorReleased -> {
                floorControlManager.handleFloorReleased()
                audioRouteManager.abandonAudioFocus()
                if (wakeLock?.isHeld == true) {
                    wakeLock?.release()
                }
            }
            is com.factorytalk.app.data.remote.SignalingEvent.FloorRevoked -> {
                floorControlManager.handleFloorRevoked(event.reason)
                audioRouteManager.abandonAudioFocus()
            }
            is com.factorytalk.app.data.remote.SignalingEvent.OfferReceived -> {
                // Incoming audio stream
                val peerConnection = webRTCManager.createPeerConnection(event.fromSocketId, object : PeerConnection.Observer {
                    override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
                    override fun onIceConnectionChange(p0: PeerConnection.IceConnectionState?) {}
                    override fun onIceConnectionReceivingChange(p0: Boolean) {}
                    override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState?) {}
                    override fun onIceCandidate(candidate: org.webrtc.IceCandidate) {
                        signalingClient.sendIceCandidate(event.fromSocketId, currentChannelId ?: "", org.json.JSONObject().apply {
                            put("sdpMid", candidate.sdpMid)
                            put("sdpMLineIndex", candidate.sdpMLineIndex)
                            put("candidate", candidate.sdp)
                        })
                    }
                    override fun onIceCandidatesRemoved(p0: Array<out org.webrtc.IceCandidate>?) {}
                    override fun onAddStream(p0: org.webrtc.MediaStream?) {
                        // In modern WebRTC, onAddTrack is preferred, but for audio this still fires
                        audioRouteManager.requestAudioFocus()
                    }
                    override fun onRemoveStream(p0: org.webrtc.MediaStream?) {}
                    override fun onDataChannel(p0: org.webrtc.DataChannel?) {}
                    override fun onRenegotiationNeeded() {}
                })
                
                webRTCManager.setRemoteDescription(event.fromSocketId, event.offer, object : org.webrtc.SdpObserver {
                    override fun onCreateSuccess(p0: org.webrtc.SessionDescription?) {}
                    override fun onSetSuccess() {
                        webRTCManager.createAnswer(event.fromSocketId, object : org.webrtc.SdpObserver {
                            override fun onCreateSuccess(answer: org.webrtc.SessionDescription) {
                                webRTCManager.setLocalDescription(event.fromSocketId, answer, object : org.webrtc.SdpObserver {
                                    override fun onCreateSuccess(p0: org.webrtc.SessionDescription?) {}
                                    override fun onSetSuccess() {
                                        signalingClient.sendAnswer(event.fromSocketId, org.json.JSONObject().apply {
                                            put("type", answer.type.canonicalForm())
                                            put("sdp", answer.description)
                                        })
                                    }
                                    override fun onCreateFailure(p0: String?) {}
                                    override fun onSetFailure(p0: String?) {}
                                })
                            }
                            override fun onSetSuccess() {}
                            override fun onCreateFailure(p0: String?) {}
                            override fun onSetFailure(p0: String?) {}
                        })
                    }
                    override fun onCreateFailure(p0: String?) {}
                    override fun onSetFailure(p0: String?) {}
                })
            }
            is com.factorytalk.app.data.remote.SignalingEvent.IceCandidateReceived -> {
                webRTCManager.addIceCandidate(event.fromSocketId, event.candidate)
            }
            is com.factorytalk.app.data.remote.SignalingEvent.AudioChunkReceived -> {
                if (event.fromUserId != currentUserId) {
                    relayAudioManager.playChunk(event.audio, event.sampleRate)
                }
            }
            is com.factorytalk.app.data.remote.SignalingEvent.Disconnected -> {
                // Handled by connection watchdog
            }
            else -> { /* other events */ }
        }
    }

    private fun startForegroundServiceWithNotification() {
        val notification = buildNotification("Factory Talk is running")
        
        var type = 0
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        }
        
        try {
            ServiceCompat.startForeground(
                this,
                Constants.NOTIFICATION_ID_FOREGROUND,
                notification,
                type
            )
        } catch (e: Exception) {
            e.printStackTrace()
            stopSelf()
        }
    }

    private fun updateNotification(text: String) {
        if (!isServiceRunning) return
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(Constants.NOTIFICATION_ID_FOREGROUND, buildNotification(text))
    }

    private fun buildNotification(text: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            },
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, Constants.NOTIFICATION_CHANNEL_PTT_SERVICE)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Factory Talk")
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            val pttChannel = NotificationChannel(
                Constants.NOTIFICATION_CHANNEL_PTT_SERVICE,
                "Push-to-Talk Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Keeps the app running in background for incoming calls" }
            
            manager.createNotificationChannel(pttChannel)
        }
    }

    private fun stopForegroundService() {
        isServiceRunning = false
        if (wakeLock?.isHeld == true) wakeLock?.release()
        connectionWatchdog.stop()
        signalingClient.disconnect()
        relayAudioManager.stopBroadcast()
        webRTCManager.dispose()
        audioRouteManager.abandonAudioFocus()
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
        stopSelf()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        stopForegroundService()
    }
}
