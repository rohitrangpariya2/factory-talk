package com.factorytalk.app.audio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Base64
import androidx.core.content.ContextCompat
import com.factorytalk.app.data.remote.SignalingClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RelayAudioManager @Inject constructor(
    private val context: Context,
    private val signalingClient: SignalingClient
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var recordingJob: Job? = null
    private var sequence = 0

    private val sampleRate = 16000
    private val channelConfigIn = AudioFormat.CHANNEL_IN_MONO
    private val channelConfigOut = AudioFormat.CHANNEL_OUT_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT

    fun startBroadcast(channelId: String, targetUserId: String? = null) {
        if (recordingJob?.isActive == true) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            return
        }

        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channelConfigIn, audioFormat)
        val bufferSize = maxOf(minBuffer, 2048)
        sequence = 0

        recordingJob = scope.launch {
            val recorder = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfigIn,
                audioFormat,
                bufferSize
            )
            val buffer = ByteArray(bufferSize)

            try {
                recorder.startRecording()
                while (isActive) {
                    val read = recorder.read(buffer, 0, buffer.size)
                    if (read > 0) {
                        val encoded = Base64.encodeToString(buffer.copyOf(read), Base64.NO_WRAP)
                        signalingClient.sendAudioChunk(channelId, targetUserId, encoded, sampleRate, sequence++)
                    }
                }
            } finally {
                recorder.stop()
                recorder.release()
            }
        }
    }

    fun stopBroadcast() {
        recordingJob?.cancel()
        recordingJob = null
    }

    fun playChunk(encodedAudio: String, incomingSampleRate: Int = sampleRate) {
        val audio = Base64.decode(encodedAudio, Base64.NO_WRAP)
        val minBuffer = AudioTrack.getMinBufferSize(incomingSampleRate, channelConfigOut, audioFormat)
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
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
            .setBufferSizeInBytes(maxOf(minBuffer, audio.size))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        scope.launch {
            try {
                track.play()
                track.write(audio, 0, audio.size)
            } finally {
                track.stop()
                track.release()
            }
        }
    }
}
