package com.factorytalk.app.audio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.util.Base64
import androidx.core.content.ContextCompat
import com.factorytalk.app.data.remote.SignalingClient
import com.factorytalk.app.util.CallStateHelper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RelayAudioManager @Inject constructor(
    private val context: Context,
    private val signalingClient: SignalingClient,
    private val audioRouteManager: AudioRouteManager
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var recordingJob: Job? = null
    private var playbackJob: Job? = null
    private var playbackTrack: AudioTrack? = null
    private var isRecording = false
    private var sequence = 0
    private var lastPlaybackSequence = -1
    private var highPassPreviousInput = 0.0
    private var highPassPreviousOutput = 0.0
    private val playbackQueue = Channel<ByteArray>(
        capacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )

    private val sampleRate = 16000
    private val channelConfigIn = AudioFormat.CHANNEL_IN_MONO
    private val channelConfigOut = AudioFormat.CHANNEL_OUT_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT
    private val recorderSources: List<Int>
        get() {
            val isSamsung = Build.MANUFACTURER.equals("samsung", ignoreCase = true)
            return if (isSamsung) {
                listOf(
                    MediaRecorder.AudioSource.VOICE_RECOGNITION,
                    MediaRecorder.AudioSource.MIC,
                    MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                    MediaRecorder.AudioSource.CAMCORDER
                )
            } else {
                listOf(
                    MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                    MediaRecorder.AudioSource.MIC,
                    MediaRecorder.AudioSource.CAMCORDER
                )
            }
        }

    fun startBroadcast(channelId: String, targetUserId: String? = null) {
        if (recordingJob?.isActive == true) return
        if (CallStateHelper.shouldBlockAppAudio(context)) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            return
        }

        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channelConfigIn, audioFormat)
        val recorderBufferSize = maxOf(minBuffer * 2, 2048)
        val chunkSize = sampleRate / 50 * 2 // 20 ms of mono PCM16 audio.
        sequence = 0

        recordingJob = scope.launch {
            val recorder = createRecorder(recorderBufferSize) ?: return@launch
            enableVoiceProcessing(recorder.audioSessionId)
            val buffer = ByteArray(chunkSize)

            try {
                isRecording = true
                recorder.startRecording()
                while (isActive) {
                    val read = recorder.read(buffer, 0, buffer.size)
                    if (read > 0) {
                        val cleanedAudio = cleanPcm16(buffer, read)
                        val encoded = Base64.encodeToString(cleanedAudio, Base64.NO_WRAP)
                        signalingClient.sendAudioChunk(channelId, targetUserId, encoded, sampleRate, sequence++)
                    }
                }
            } finally {
                isRecording = false
                recorder.stop()
                recorder.release()
            }
        }
    }

    private fun createRecorder(bufferSize: Int): AudioRecord? {
        for (source in recorderSources) {
            val recorder = runCatching {
                AudioRecord(
                    source,
                    sampleRate,
                    channelConfigIn,
                    audioFormat,
                    bufferSize
                )
            }.getOrNull()

            if (recorder?.state == AudioRecord.STATE_INITIALIZED) {
                return recorder
            }
            recorder?.release()
        }
        return null
    }

    fun stopBroadcast() {
        recordingJob?.cancel()
        recordingJob = null
        isRecording = false
    }

    fun playChunk(encodedAudio: String, incomingSampleRate: Int = sampleRate, incomingSequence: Int = 0) {
        if (isRecording) return
        if (CallStateHelper.shouldBlockAppAudio(context)) return
        if (incomingSequence == 0) {
            lastPlaybackSequence = -1
            clearPlaybackQueue()
        }
        if (incomingSequence <= lastPlaybackSequence) return

        val audio = Base64.decode(encodedAudio, Base64.NO_WRAP)
        ensurePlayback(incomingSampleRate)
        lastPlaybackSequence = incomingSequence
        playbackQueue.trySend(audio)
    }

    private fun clearPlaybackQueue() {
        while (playbackQueue.tryReceive().isSuccess) {
            // Drop stale audio so the next talk starts immediately.
        }
    }

    private fun ensurePlayback(incomingSampleRate: Int) {
        if (playbackJob?.isActive == true) return

        val minBuffer = AudioTrack.getMinBufferSize(incomingSampleRate, channelConfigOut, audioFormat)
        val preferredOutput = audioRouteManager.prepareForPlayback()
        playbackTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(incomingSampleRate)
                    .setEncoding(audioFormat)
                    .setChannelMask(channelConfigOut)
                    .build()
            )
            .setBufferSizeInBytes(maxOf(minBuffer * 2, sampleRate / 25 * 2))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
            .apply {
                preferredOutput?.let { setPreferredDevice(it) }
            }

        playbackJob = scope.launch {
            val track = playbackTrack ?: return@launch
            try {
                track.play()
                track.setVolume(1.0f)
                for (chunk in playbackQueue) {
                    track.write(chunk, 0, chunk.size)
                }
            } finally {
                track.stop()
                track.release()
                playbackTrack = null
            }
        }
    }

    private fun enableVoiceProcessing(audioSessionId: Int) {
        if (NoiseSuppressor.isAvailable()) {
            NoiseSuppressor.create(audioSessionId)?.enabled = true
        }
        if (AutomaticGainControl.isAvailable()) {
            AutomaticGainControl.create(audioSessionId)?.enabled = false
        }
        if (AcousticEchoCanceler.isAvailable()) {
            AcousticEchoCanceler.create(audioSessionId)?.enabled = true
        }
    }

    private fun cleanPcm16(source: ByteArray, length: Int): ByteArray {
        val cleaned = source.copyOf(length)
        val noiseGate = 430
        val quietRmsGate = 620.0
        val softRmsGate = 1050.0
        val limiter = 26000
        val sampleCount = cleaned.size / 2
        if (sampleCount == 0) return cleaned

        var energy = 0.0
        var scanIndex = 0
        while (scanIndex + 1 < cleaned.size) {
            var sample = (cleaned[scanIndex].toInt() and 0xFF) or (cleaned[scanIndex + 1].toInt() shl 8)
            if (sample > Short.MAX_VALUE) sample -= 65536
            energy += sample.toDouble() * sample.toDouble()
            scanIndex += 2
        }

        val rms = kotlin.math.sqrt(energy / sampleCount)
        if (rms < quietRmsGate) {
            return ByteArray(length)
        }
        val quietGain = if (rms < softRmsGate) 0.35 else 1.0

        var i = 0
        while (i + 1 < cleaned.size) {
            var sample = (cleaned[i].toInt() and 0xFF) or (cleaned[i + 1].toInt() shl 8)
            if (sample > Short.MAX_VALUE) sample -= 65536

            val highPassed = sample - highPassPreviousInput + (0.96 * highPassPreviousOutput)
            highPassPreviousInput = sample.toDouble()
            highPassPreviousOutput = highPassed
            sample = highPassed.toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())

            sample = when {
                kotlin.math.abs(sample) < noiseGate -> 0
                sample > limiter -> limiter + ((sample - limiter) / 4)
                sample < -limiter -> -limiter + ((sample + limiter) / 4)
                else -> sample
            }
            sample = (sample * quietGain).toInt()
                .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())

            cleaned[i] = (sample and 0xFF).toByte()
            cleaned[i + 1] = ((sample shr 8) and 0xFF).toByte()
            i += 2
        }
        return cleaned
    }
}
