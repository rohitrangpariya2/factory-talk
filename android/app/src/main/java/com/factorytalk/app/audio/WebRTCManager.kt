package com.factorytalk.app.audio

import android.content.Context
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.audio.JavaAudioDeviceModule

class WebRTCManager(private val context: Context) {
    private val factory: PeerConnectionFactory
    private val peerConnections = mutableMapOf<String, PeerConnection>()
    private var localAudioTrack: AudioTrack? = null
    private var localAudioSource: AudioSource? = null

    private val iceServers = listOf(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("turn:a.relay.metered.ca:443?transport=tcp")
            .setUsername("your-username").setPassword("your-credential").createIceServer()
    )

    init {
        val options = PeerConnectionFactory.InitializationOptions.builder(context)
            .setEnableInternalTracer(false)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)

        val audioDeviceModule = JavaAudioDeviceModule.builder(context)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .createAudioDeviceModule()

        factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(audioDeviceModule)
            .createPeerConnectionFactory()
    }

    fun createAudioTrack(): AudioTrack {
        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", "true"))
        }
        localAudioSource = factory.createAudioSource(audioConstraints)
        localAudioTrack = factory.createAudioTrack("audio_track_0", localAudioSource)
        localAudioTrack?.setEnabled(false) // Muted by default
        return localAudioTrack!!
    }

    fun createPeerConnection(peerId: String, observer: PeerConnection.Observer): PeerConnection {
        val rtcConfig = PeerConnection.RTCConfiguration(iceServers)
        val pc = factory.createPeerConnection(rtcConfig, observer)
            ?: throw IllegalStateException("Failed to create PeerConnection")
            
        localAudioTrack?.let { pc.addTrack(it) }
        peerConnections[peerId] = pc
        return pc
    }

    fun createOffer(peerId: String, sdpObserver: SdpObserver) {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
        }
        peerConnections[peerId]?.createOffer(sdpObserver, constraints)
    }

    fun createAnswer(peerId: String, sdpObserver: SdpObserver) {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
        }
        peerConnections[peerId]?.createAnswer(sdpObserver, constraints)
    }

    fun setRemoteDescription(peerId: String, sdp: SessionDescription, observer: SdpObserver) {
        peerConnections[peerId]?.setRemoteDescription(observer, sdp)
    }

    fun setLocalDescription(peerId: String, sdp: SessionDescription, observer: SdpObserver) {
        peerConnections[peerId]?.setLocalDescription(observer, sdp)
    }

    fun addIceCandidate(peerId: String, candidate: IceCandidate) {
        peerConnections[peerId]?.addIceCandidate(candidate)
    }

    fun setMicEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    fun closePeerConnection(peerId: String) {
        peerConnections[peerId]?.close()
        peerConnections.remove(peerId)
    }

    fun closeAll() {
        peerConnections.values.forEach { it.close() }
        peerConnections.clear()
    }

    fun dispose() {
        closeAll()
        localAudioTrack?.dispose()
        localAudioSource?.dispose()
        factory.dispose()
        PeerConnectionFactory.shutdownInternalTracer()
    }
}
