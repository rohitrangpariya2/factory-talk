package com.factorytalk.app.data.demo

import android.content.Context
import android.provider.Settings
import com.factorytalk.app.util.Constants
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceIdentityProvider @Inject constructor(
    private val context: Context
) {
    fun getDeviceId(): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        )
        return "device-${androidId ?: "unknown"}"
    }

    fun getDeviceName(): String {
        val prefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(Constants.PREF_DEVICE_NAME, null)
            ?: android.os.Build.MODEL
            ?: "Factory Phone"
    }

    fun setDeviceName(name: String) {
        context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(Constants.PREF_DEVICE_NAME, name.trim())
            .apply()
    }
}
