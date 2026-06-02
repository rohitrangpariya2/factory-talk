package com.factorytalk.app.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.Manifest
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.BatteryManager
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.factorytalk.app.MainActivity
import com.factorytalk.app.R
import com.factorytalk.app.audio.AudioRouteManager
import com.factorytalk.app.audio.FloorControlManager
import com.factorytalk.app.audio.RelayAudioManager
import com.factorytalk.app.audio.WebRTCManager
import com.factorytalk.app.data.model.UserRole
import com.factorytalk.app.data.model.ServerHealthStatus
import com.factorytalk.app.data.remote.ServerHealthMonitor
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
import kotlinx.coroutines.delay
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
    @Inject lateinit var serverHealthMonitor: ServerHealthMonitor

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var wakeLock: PowerManager.WakeLock? = null
    private var isServiceRunning = false
    private var currentChannelId: String? = null
    private var targetUserId: String? = null
    private var currentUserId: String? = null
    private var currentUserName: String? = null
    private var currentUserRole: UserRole = UserRole.WORKER
    private var statusJob: Job? = null
    private var signalingJob: Job? = null
    private var reconnectJob: Job? = null
    private var callStatusJob: Job? = null
    private var locationJob: Job? = null
    private var locationListener: LocationListener? = null
    private var lastKnownLocation: Location? = null
    private var hasSentFreshLocation = false
    private var lastStaleLocationHeartbeatAt = 0L
    private var locationProvidersAvailable = false
    private var isTalking = false
    private var lastCallBusyStatus = false
    private var explicitStopRequested = false

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
            serverHealthMonitor.start(Constants.SERVER_URL)
            observeServerStatus()
            observeNetworkReconnect()
            observeCallStatus()
            observeLocationSharing()
            initializeSignaling()
            ServiceRestartScheduler.scheduleWatchdog(this)
        }
        
        when (action) {
            Constants.ACTION_START_SERVICE -> {
                // Just starting normally
                updateNotification("Connecting...")
            }
            Constants.ACTION_STOP_SERVICE -> {
                explicitStopRequested = true
                stopForegroundService()
            }
            Constants.ACTION_REFRESH_IDENTITY -> {
                signalingClient.disconnect()
                initializeSignaling()
                updateNotification("Connected - Listening")
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
                isTalking = true
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
                isTalking = false
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
        signalingJob?.cancel()
        signalingJob = serviceScope.launch {
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

    private fun observeNetworkReconnect() {
        if (reconnectJob?.isActive == true) return
        reconnectJob = serviceScope.launch {
            while (true) {
                delay(10_000L)
                if (
                    connectionWatchdog.networkState.value &&
                    signalingClient.connectionState.value != com.factorytalk.app.data.model.ConnectionState.CONNECTED
                ) {
                    signalingClient.disconnect()
                    initializeSignaling()
                    updateNotification("Reconnecting...")
                } else if (signalingClient.connectionState.value == com.factorytalk.app.data.model.ConnectionState.CONNECTED) {
                    currentChannelId?.let { signalingClient.joinChannel(it) }
                }
            }
        }
    }

    private fun observeCallStatus() {
        if (callStatusJob?.isActive == true) return
        callStatusJob = serviceScope.launch {
            while (true) {
                val isBusy = com.factorytalk.app.util.CallStateHelper.isPhoneCallActive(this@TalkForegroundService)
                if (isBusy != lastCallBusyStatus) {
                    lastCallBusyStatus = isBusy
                    signalingClient.sendUserStatus(isBusy)
                    if (isBusy) {
                        relayAudioManager.stopBroadcast()
                        updateNotification("Phone call active - Busy")
                    } else if (signalingClient.connectionState.value == com.factorytalk.app.data.model.ConnectionState.CONNECTED) {
                        updateNotification("Connected - Listening")
                    }
                }
                delay(3000L)
            }
        }
    }

    private fun isWithinTrackingHours(): Boolean {
        val calendar = java.util.Calendar.getInstance()
        val hour = calendar.get(java.util.Calendar.HOUR_OF_DAY)
        return hour in 9..19
    }

    private fun observeLocationSharing() {
        if (locationJob?.isActive == true) return
        locationJob = serviceScope.launch {
            while (true) {
                val enabled = getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(Constants.PREF_LOCATION_SHARING_ENABLED, false)
                val withinHours = isWithinTrackingHours()
                if (enabled && hasLocationPermission() && withinHours) {
                    if (locationListener == null) {
                        startForegroundServiceWithNotification()
                    }
                    if (isLastLocationStale(Constants.LOCATION_STALE_RESTART_MS)) {
                        stopLocationUpdates()
                    }
                    startLocationUpdates()
                    sendLastKnownLocation(allowStaleHeartbeat = true)
                } else {
                    if (enabled) {
                        if (!withinHours) {
                            updateLocationStatus("Tracking inactive (Active hours: 9AM - 8PM)")
                        } else {
                            updateLocationStatus("Location permission missing")
                        }
                    }
                    stopLocationUpdates()
                }
                delay(5_000L)
            }
        }
    }

    private fun startLocationUpdates() {
        if (locationListener != null) return
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { provider -> runCatching { locationManager.isProviderEnabled(provider) }.getOrDefault(false) }
        locationProvidersAvailable = providers.isNotEmpty()
        loadLastKnownLocation(locationManager)
        if (providers.isEmpty()) {
            updateLocationStatus("Phone Location/GPS is OFF")
            sendLastKnownLocation()
            return
        }

        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                val previous = lastKnownLocation
                if (previous == null || shouldAcceptLocation(location, previous)) {
                    lastKnownLocation = location
                    sendLastKnownLocation()
                }
            }
        }
        try {
            locationListener = listener
            loadLastKnownLocation(locationManager)
            sendLastKnownLocation()
            providers.forEach { provider ->
                runCatching {
                    locationManager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
                }
                locationManager.requestLocationUpdates(provider, 5_000L, 0f, listener, Looper.getMainLooper())
            }
            if (lastKnownLocation == null) updateLocationStatus("Waiting for GPS/location fix")
        } catch (e: SecurityException) {
            locationListener = null
            updateLocationStatus("Location permission missing")
        } catch (e: IllegalArgumentException) {
            locationListener = null
            updateLocationStatus("Location provider error")
        }
    }

    @SuppressLint("MissingPermission")
    private fun loadLastKnownLocation(locationManager: LocationManager) {
        if (!hasLocationPermission()) return
        locationManager.getProviders(true).forEach { provider ->
            runCatching { locationManager.getLastKnownLocation(provider) }.getOrNull()?.let { location ->
                if (lastKnownLocation == null || location.time >= (lastKnownLocation?.time ?: 0L)) {
                    lastKnownLocation = location
                }
            }
        }
    }

    private fun stopLocationUpdates() {
        val listener = locationListener ?: return
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        runCatching { locationManager.removeUpdates(listener) }
        locationListener = null
    }

    private fun sendLastKnownLocation(allowStaleHeartbeat: Boolean = false) {
        if (!isWithinTrackingHours()) return
        val location = lastKnownLocation ?: return
        val now = System.currentTimeMillis()
        val batteryLevel = getBatteryLevel()
        val isFreshLocation = !isLocationStale(location, Constants.LOCATION_FIX_STALE_MS)
        val speedKmhValue = validatedSpeedKmh(location, isFreshLocation)
        val bearingValue = validatedBearing(location, isFreshLocation)
        val isCallActiveValue: Boolean = lastCallBusyStatus
        if (!isFreshLocation) {
            if (
                !allowStaleHeartbeat ||
                !hasSentFreshLocation ||
                !locationProvidersAvailable ||
                now - lastStaleLocationHeartbeatAt < Constants.LOCATION_HEARTBEAT_INTERVAL_MS
            ) {
                updateLocationStatus("Waiting for fresh GPS/location fix")
                return
            }

            signalingClient.sendLocation(
                location.latitude,
                location.longitude,
                location.accuracy,
                batteryLevel = batteryLevel,
                isCallActive = isCallActiveValue
            )
            lastStaleLocationHeartbeatAt = now
            saveLocationSent(location, "Last location heartbeat sent")
            return
        }

        signalingClient.sendLocation(
            location.latitude,
            location.longitude,
            location.accuracy,
            location.time,
            batteryLevel,
            speedKmh = speedKmhValue,
            bearing = bearingValue?.first,
            bearingAccuracyDegrees = bearingValue?.second,
            isCallActive = isCallActiveValue
        )
        hasSentFreshLocation = true
        saveLocationSent(location, "Location sent")
    }

    private fun getBatteryLevel(): Int? {
        val manager = getSystemService(BATTERY_SERVICE) as? BatteryManager ?: return null
        val level = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (level in 0..100) level else null
    }

    private fun saveLocationSent(location: Location, status: String) {
        getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(Constants.PREF_LAST_LOCATION_SENT_AT, System.currentTimeMillis())
            .putString(Constants.PREF_LAST_LOCATION_LATITUDE, location.latitude.toString())
            .putString(Constants.PREF_LAST_LOCATION_LONGITUDE, location.longitude.toString())
            .putString(Constants.PREF_LOCATION_STATUS, status)
            .apply()
    }

    private fun isLastLocationStale(maxAgeMs: Long): Boolean {
        val location = lastKnownLocation ?: return true
        return isLocationStale(location, maxAgeMs)
    }

    private fun isLocationStale(location: Location, maxAgeMs: Long): Boolean {
        val ageMs = System.currentTimeMillis() - location.time
        return location.time <= 0L || ageMs > maxAgeMs || ageMs < -30_000L
    }

    private fun shouldAcceptLocation(location: Location, previous: Location): Boolean {
        val locationFresh = !isLocationStale(location, Constants.LOCATION_FIX_STALE_MS)
        val previousFresh = !isLocationStale(previous, Constants.LOCATION_FIX_STALE_MS)
        if (locationFresh && !previousFresh) return true
        if (!locationFresh && previousFresh) return false
        if (location.time > previous.time + 15_000L) return true
        return location.accuracy <= previous.accuracy + 20f
    }

    private fun validatedSpeedKmh(location: Location, isFreshLocation: Boolean): Float? {
        if (!isFreshLocation || !location.hasSpeed() || location.speed < 0f) return null
        val speedKmh = location.speed * 3.6f
        if (speedKmh > 130f) return null
        if (location.hasAccuracy() && location.accuracy > 100f) return null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            location.hasSpeedAccuracy() &&
            location.speedAccuracyMetersPerSecond > 8f
        ) {
            return null
        }
        return speedKmh
    }

    private fun validatedBearing(location: Location, isFreshLocation: Boolean): Pair<Float, Float>? {
        if (!isFreshLocation || !location.hasBearing()) return null
        if (location.hasAccuracy() && location.accuracy > 100f) return null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            !location.hasBearingAccuracy() ||
            location.bearingAccuracyDegrees > 45f
        ) {
            return null
        }
        val normalizedBearing = ((location.bearing % 360f) + 360f) % 360f
        return normalizedBearing to location.bearingAccuracyDegrees
    }

    private fun updateLocationStatus(status: String) {
        getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(Constants.PREF_LOCATION_STATUS, status)
            .apply()
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    private fun observeServerStatus() {
        if (statusJob?.isActive == true) return
        statusJob = serviceScope.launch {
            serverHealthMonitor.status.collect { status ->
                if (isTalking) return@collect
                val message = when (status) {
                    ServerHealthStatus.CHECKING -> "Connecting... waking server"
                    ServerHealthStatus.OFFLINE -> "Server sleeping/offline - retrying"
                    ServerHealthStatus.AWAKE -> {
                        if (signalingClient.connectionState.value == com.factorytalk.app.data.model.ConnectionState.CONNECTED) {
                            "Connected - Listening"
                        } else {
                            "Server awake - connecting"
                        }
                    }
                    ServerHealthStatus.UNKNOWN -> "Connecting..."
                }
                updateNotification(message)
            }
        }
    }

    private fun handleSignalingEvent(event: com.factorytalk.app.data.remote.SignalingEvent, currentUserId: String) {
        when (event) {
            is com.factorytalk.app.data.remote.SignalingEvent.Connected -> {
                currentChannelId?.let { signalingClient.joinChannel(it) }
                sendLastKnownLocation()
                updateNotification("Connected - Listening")
            }
            is com.factorytalk.app.data.remote.SignalingEvent.LocationUpdateRequested -> {
                val enabled = getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(Constants.PREF_LOCATION_SHARING_ENABLED, false)
                if (enabled && hasLocationPermission()) {
                    startLocationUpdates()
                    sendLastKnownLocation(allowStaleHeartbeat = true)
                }
            }
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
                    relayAudioManager.playChunk(event.audio, event.sampleRate, event.sequence)
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
            val locationEnabled = getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(Constants.PREF_LOCATION_SHARING_ENABLED, false)
            if (locationEnabled && hasLocationPermission()) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            }
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
        val restartPendingIntent = PendingIntent.getBroadcast(
            this,
            3001,
            Intent(this, StartupReceiver::class.java).apply {
                action = Constants.ACTION_RESTART_SERVICE
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, Constants.NOTIFICATION_CHANNEL_PTT_SERVICE)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Factory Talk")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setDeleteIntent(restartPendingIntent)
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
        cleanupRuntimeResources()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
        stopSelf()
    }

    private fun cleanupRuntimeResources() {
        statusJob?.cancel()
        statusJob = null
        signalingJob?.cancel()
        signalingJob = null
        reconnectJob?.cancel()
        reconnectJob = null
        callStatusJob?.cancel()
        callStatusJob = null
        locationJob?.cancel()
        locationJob = null
        stopLocationUpdates()
        if (wakeLock?.isHeld == true) wakeLock?.release()
        runCatching { connectionWatchdog.stop() }
        serverHealthMonitor.stop()
        signalingClient.disconnect()
        relayAudioManager.stopBroadcast()
        webRTCManager.dispose()
        audioRouteManager.abandonAudioFocus()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        scheduleServiceRestart()
    }

    private fun scheduleServiceRestart() {
        ServiceRestartScheduler.scheduleRestart(applicationContext)
        ServiceRestartScheduler.scheduleWatchdog(applicationContext)
    }

    override fun onDestroy() {
        super.onDestroy()
        cleanupRuntimeResources()
        if (!explicitStopRequested) {
            scheduleServiceRestart()
        }
    }
}
