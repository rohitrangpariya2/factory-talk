package com.factorytalk.app.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import com.factorytalk.app.util.Constants

object ServiceRestartScheduler {
    fun scheduleRestart(context: Context, delayMs: Long = 1500L) {
        schedule(context, Constants.ACTION_START_SERVICE, 2001, delayMs)
    }

    fun scheduleWatchdog(context: Context, delayMs: Long = Constants.SERVICE_WATCHDOG_INTERVAL_MS) {
        schedule(context, Constants.ACTION_SERVICE_WATCHDOG, 2002, delayMs)
    }

    private fun schedule(context: Context, action: String, requestCode: Int, delayMs: Long) {
        val intent = Intent(context.applicationContext, StartupReceiver::class.java).apply {
            this.action = action
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context.applicationContext,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + delayMs,
            pendingIntent
        )
    }
}
