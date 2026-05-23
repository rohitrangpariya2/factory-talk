package com.factorytalk.app.audio

import com.factorytalk.app.data.demo.DemoData
import com.factorytalk.app.data.model.FloorState
import com.factorytalk.app.data.model.TalkSession
import com.factorytalk.app.data.model.UserRole
import com.factorytalk.app.data.remote.SignalingClient
import com.factorytalk.app.util.Constants
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FloorControlManager @Inject constructor(
    private val signalingClient: SignalingClient,
    private val webRTCManager: WebRTCManager
) {
    private val _floorState = MutableStateFlow<FloorState>(FloorState.Idle)
    val floorState: StateFlow<FloorState> = _floorState.asStateFlow()

    private val _currentSpeaker = MutableStateFlow<TalkSession?>(null)
    val currentSpeaker: StateFlow<TalkSession?> = _currentSpeaker.asStateFlow()

    private val _isTalking = MutableStateFlow(false)
    val isTalking: StateFlow<Boolean> = _isTalking.asStateFlow()

    private val _talkDurationSeconds = MutableStateFlow(60)
    val talkDurationSeconds: StateFlow<Int> = _talkDurationSeconds.asStateFlow()

    private var timerJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    fun requestFloor(channelId: String) {
        if (Constants.DEMO_MODE) {
            handleFloorGranted(
                userId = Constants.DEMO_USER_ID,
                name = Constants.DEMO_USER_NAME,
                role = DemoData.currentUser().role,
                currentUserId = Constants.DEMO_USER_ID,
                channelId = channelId
            )
            return
        }

        signalingClient.requestFloor(channelId)
    }

    fun releaseFloor(channelId: String) {
        if (!Constants.DEMO_MODE) {
            signalingClient.releaseFloor(channelId)
        }
        webRTCManager.setMicEnabled(false)
        stopTimer()
        _isTalking.value = false
        _floorState.value = FloorState.Idle
    }

    fun handleFloorGranted(userId: String, name: String, role: UserRole, currentUserId: String, channelId: String) {
        val isSelf = userId == currentUserId
        _floorState.value = FloorState.Granted(name, role, isSelf)
        
        _currentSpeaker.value = TalkSession(
            channelId = channelId,
            speakerUserId = userId,
            speakerName = name,
            speakerRole = role
        )

        if (isSelf) {
            webRTCManager.setMicEnabled(true)
            _isTalking.value = true
            startTimer()
        } else {
            webRTCManager.setMicEnabled(false)
            _isTalking.value = false
        }
    }

    fun handleFloorDenied(reason: String) {
        _floorState.value = FloorState.Denied(reason)
        webRTCManager.setMicEnabled(false)
        _isTalking.value = false
        
        // Reset to idle after 2 seconds
        scope.launch {
            delay(2000)
            if (_floorState.value is FloorState.Denied) {
                _floorState.value = FloorState.Idle
            }
        }
    }

    fun handleFloorRevoked(reason: String) {
        _floorState.value = FloorState.Revoked(reason)
        webRTCManager.setMicEnabled(false)
        stopTimer()
        _isTalking.value = false
        
        // Reset to idle after 2 seconds
        scope.launch {
            delay(2000)
            if (_floorState.value is FloorState.Revoked) {
                _floorState.value = FloorState.Idle
            }
        }
    }

    fun handleFloorReleased() {
        _floorState.value = FloorState.Idle
        _currentSpeaker.value = null
        webRTCManager.setMicEnabled(false)
        stopTimer()
        _isTalking.value = false
    }

    private fun startTimer() {
        stopTimer()
        _talkDurationSeconds.value = 60
        timerJob = scope.launch {
            while (_talkDurationSeconds.value > 0) {
                delay(1000)
                _talkDurationSeconds.value -= 1
            }
            // Timer expired, auto-release floor would happen on server side,
            // but we can proactively stop here too.
        }
    }

    private fun stopTimer() {
        timerJob?.cancel()
        timerJob = null
    }
}
