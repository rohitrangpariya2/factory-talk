package com.factorytalk.app.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class AudioRouteManager(private val context: Context) {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    
    private val _audioRouteFlow = MutableStateFlow(AudioRoute.SPEAKER)
    val audioRouteFlow: StateFlow<AudioRoute> = _audioRouteFlow.asStateFlow()

    private var focusRequest: AudioFocusRequest? = null

    init {
        // Mode for VoIP calls
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        setSpeakerOn()
    }

    fun setSpeakerOn() {
        audioManager.isSpeakerphoneOn = true
        _audioRouteFlow.value = AudioRoute.SPEAKER
    }

    fun setSpeakerOff() {
        audioManager.isSpeakerphoneOn = false
        _audioRouteFlow.value = AudioRoute.EARPIECE
    }

    fun routeToBluetooth() {
        if (isBluetoothConnected()) {
            audioManager.startBluetoothSco()
            audioManager.isBluetoothScoOn = true
            _audioRouteFlow.value = AudioRoute.BLUETOOTH
        } else {
            setSpeakerOn()
        }
    }

    fun routeToSpeaker() {
        audioManager.stopBluetoothSco()
        audioManager.isBluetoothScoOn = false
        setSpeakerOn()
    }

    fun getCurrentRoute(): AudioRoute = _audioRouteFlow.value

    fun requestAudioFocus(): Boolean {
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()

        focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
            .setAudioAttributes(attributes)
            .setAcceptsDelayedFocusGain(true)
            .setOnAudioFocusChangeListener { focusChange ->
                when (focusChange) {
                    AudioManager.AUDIOFOCUS_LOSS -> abandonAudioFocus()
                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> { /* pause */ }
                    AudioManager.AUDIOFOCUS_GAIN -> { /* resume */ }
                }
            }
            .build()

        val result = audioManager.requestAudioFocus(focusRequest!!)
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    fun abandonAudioFocus() {
        focusRequest?.let {
            audioManager.abandonAudioFocusRequest(it)
        }
        focusRequest = null
    }

    fun isBluetoothConnected(): Boolean {
        // Simplified check, in a real app would use BluetoothManager and profile proxy
        return audioManager.isBluetoothA2dpOn || audioManager.isBluetoothScoOn
    }
}

enum class AudioRoute {
    SPEAKER,
    EARPIECE,
    BLUETOOTH
}
