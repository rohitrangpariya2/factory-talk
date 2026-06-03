package com.factorytalk.app.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.factorytalk.app.util.Constants
import java.util.Calendar

object AutoTrackingScheduler {
    private const val REQUEST_START = 5101
    private const val REQUEST_STOP = 5102

    fun schedule(context: Context) {
        val appContext = context.applicationContext
        val prefs = appContext.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(Constants.PREF_AUTO_TRACKING_ENABLED, false)) {
            cancel(appContext)
            prefs.edit().putString(Constants.PREF_AUTO_TRACKING_STATUS, "Auto Tracking OFF").apply()
            return
        }

        val startAt = nextTriggerAt(Constants.AUTO_TRACKING_START_HOUR, Constants.AUTO_TRACKING_START_MINUTE)
        val stopAt = nextTriggerAt(Constants.AUTO_TRACKING_STOP_HOUR, Constants.AUTO_TRACKING_STOP_MINUTE)
        scheduleAlarm(appContext, Constants.ACTION_AUTO_TRACKING_START, REQUEST_START, startAt)
        scheduleAlarm(appContext, Constants.ACTION_AUTO_TRACKING_STOP, REQUEST_STOP, stopAt)
        prefs.edit()
            .putLong(Constants.PREF_AUTO_TRACKING_LAST_SCHEDULED_START_AT, startAt)
            .putLong(Constants.PREF_AUTO_TRACKING_LAST_SCHEDULED_STOP_AT, stopAt)
            .putString(Constants.PREF_AUTO_TRACKING_STATUS, statusForNow(isWithinTrackingWindow()))
            .apply()
    }

    fun cancel(context: Context) {
        val appContext = context.applicationContext
        cancelAlarm(appContext, Constants.ACTION_AUTO_TRACKING_START, REQUEST_START)
        cancelAlarm(appContext, Constants.ACTION_AUTO_TRACKING_STOP, REQUEST_STOP)
    }

    fun isWithinTrackingWindow(now: Calendar = Calendar.getInstance()): Boolean {
        val minutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
        val start = Constants.AUTO_TRACKING_START_HOUR * 60 + Constants.AUTO_TRACKING_START_MINUTE
        val stop = Constants.AUTO_TRACKING_STOP_HOUR * 60 + Constants.AUTO_TRACKING_STOP_MINUTE
        return minutes in start until stop
    }

    fun startService(context: Context, action: String) {
        val intent = Intent(context.applicationContext, TalkForegroundService::class.java).apply {
            this.action = action
        }
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.applicationContext.startForegroundService(intent)
            } else {
                context.applicationContext.startService(intent)
            }
        }
    }

    fun statusForNow(withinWindow: Boolean): String {
        return if (withinWindow) "Currently Tracking" else "Not Tracking"
    }

    private fun scheduleAlarm(context: Context, action: String, requestCode: Int, triggerAtMillis: Long) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            triggerAtMillis,
            pendingIntent(context, action, requestCode)
        )
    }

    private fun cancelAlarm(context: Context, action: String, requestCode: Int) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntent(context, action, requestCode))
    }

    private fun pendingIntent(context: Context, action: String, requestCode: Int): PendingIntent {
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            Intent(context, AutoTrackingReceiver::class.java).apply { this.action = action },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun nextTriggerAt(hour: Int, minute: Int): Long {
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (calendar.timeInMillis <= System.currentTimeMillis()) {
            calendar.add(Calendar.DAY_OF_YEAR, 1)
        }
        return calendar.timeInMillis
    }
}
