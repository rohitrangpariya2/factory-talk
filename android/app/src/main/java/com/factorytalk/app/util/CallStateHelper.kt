package com.factorytalk.app.util

import android.content.Context
import android.media.AudioManager

object CallStateHelper {
    fun isPhoneCallActive(context: Context): Boolean {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return audioManager.mode == AudioManager.MODE_IN_CALL ||
            audioManager.mode == AudioManager.MODE_CALL_SCREENING
    }

    fun shouldBlockAppAudio(context: Context): Boolean {
        val prefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        val allowDuringCall = prefs.getBoolean(Constants.PREF_ALLOW_AUDIO_DURING_CALL, false)
        return isPhoneCallActive(context) && !allowDuringCall
    }
}
