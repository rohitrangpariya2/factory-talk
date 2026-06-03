package com.factorytalk.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.factorytalk.app.util.Constants

class AutoTrackingReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val prefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(Constants.PREF_AUTO_TRACKING_ENABLED, false)) {
            AutoTrackingScheduler.cancel(context)
            prefs.edit().putString(Constants.PREF_AUTO_TRACKING_STATUS, "Auto Tracking OFF").apply()
            return
        }

        when (action) {
            Constants.ACTION_AUTO_TRACKING_START -> {
                AutoTrackingScheduler.schedule(context)
                if (AutoTrackingScheduler.isWithinTrackingWindow()) {
                    prefs.edit()
                        .putString(Constants.PREF_AUTO_TRACKING_STATUS, "Currently Tracking")
                        .apply()
                    AutoTrackingScheduler.startService(context, Constants.ACTION_AUTO_TRACKING_START)
                }
            }
            Constants.ACTION_AUTO_TRACKING_STOP -> {
                prefs.edit()
                    .putString(Constants.PREF_AUTO_TRACKING_STATUS, "Not Tracking")
                    .apply()
                AutoTrackingScheduler.startService(context, Constants.ACTION_AUTO_TRACKING_STOP)
                AutoTrackingScheduler.schedule(context)
            }
        }
    }
}
