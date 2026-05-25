package com.factorytalk.app.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
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
        refreshRoute()
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
            audioManager.isSpeakerphoneOn = false
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

    fun prepareForPlayback(): AudioDeviceInfo? {
        val externalDevice = preferredOutputDevice()
        if (externalDevice != null) {
            audioManager.isSpeakerphoneOn = false
            _audioRouteFlow.value = when (externalDevice.type) {
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                AudioDeviceInfo.TYPE_BLE_HEADSET,
                AudioDeviceInfo.TYPE_BLE_SPEAKER -> AudioRoute.BLUETOOTH
                else -> AudioRoute.HEADSET
            }
            return externalDevice
        }

        audioManager.isSpeakerphoneOn = true
        _audioRouteFlow.value = AudioRoute.SPEAKER
        return null
    }

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
        return audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { device ->
            device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                device.type == AudioDeviceInfo.TYPE_BLE_SPEAKER
        }
    }

    private fun refreshRoute() {
        _audioRouteFlow.value = when (preferredOutputDevice()?.type) {
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_BLE_HEADSET,
            AudioDeviceInfo.TYPE_BLE_SPEAKER -> AudioRoute.BLUETOOTH
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_USB_HEADSET -> AudioRoute.HEADSET
            else -> AudioRoute.SPEAKER
        }
    }

    private fun preferredOutputDevice(): AudioDeviceInfo? {
        val outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
        return outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP }
            ?: outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
            ?: outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLE_HEADSET }
            ?: outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLE_SPEAKER }
            ?: outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES }
            ?: outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET }
            ?: outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_USB_HEADSET }
    }
}

enum class AudioRoute {
    SPEAKER,
    EARPIECE,
    BLUETOOTH,
    HEADSET
}
