package com.factorytalk.app.util

import android.content.Context
import android.media.AudioManager

object CallStateHelper {
    fun isPhoneCallActive(context: Context): Boolean {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return audioManager.mode == AudioManager.MODE_IN_CALL ||
            audioManager.mode == AudioManager.MODE_IN_COMMUNICATION ||
            audioManager.mode == AudioManager.MODE_CALL_SCREENING
    }
}
