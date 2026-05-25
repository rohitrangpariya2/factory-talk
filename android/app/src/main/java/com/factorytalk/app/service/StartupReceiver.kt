package com.factorytalk.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.factorytalk.app.util.Constants

class StartupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (
            action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == Constants.ACTION_RESTART_SERVICE ||
            action == Constants.ACTION_SERVICE_WATCHDOG ||
            action == Constants.ACTION_START_SERVICE
        ) {
            val serviceIntent = Intent(context, TalkForegroundService::class.java).apply {
                this.action = Constants.ACTION_START_SERVICE
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            ServiceRestartScheduler.scheduleWatchdog(context)
        }
    }
}
