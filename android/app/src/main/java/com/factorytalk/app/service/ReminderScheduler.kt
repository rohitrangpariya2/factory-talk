package com.factorytalk.app.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.factorytalk.app.util.Constants
import java.util.Calendar

object ReminderScheduler {
    fun saveSchedule(context: Context, onTime: String, offTime: String) {
        context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(Constants.PREF_REMINDER_ON_TIME, onTime)
            .putString(Constants.PREF_REMINDER_OFF_TIME, offTime)
            .apply()
        scheduleNext(context)
    }

    fun scheduleNext(context: Context) {
        val prefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        val reminders = listOfNotNull(
            reminderAt(prefs.getString(Constants.PREF_REMINDER_ON_TIME, "") ?: "", true),
            reminderAt(prefs.getString(Constants.PREF_REMINDER_OFF_TIME, "") ?: "", false)
        )
        val next = reminders.minByOrNull { it.triggerAtMillis } ?: return
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(Constants.EXTRA_REMINDER_MESSAGE, if (next.isOnReminder) "Walkie Talkie ON karo" else "Walkie Talkie OFF karo")
            putExtra(Constants.EXTRA_REMINDER_ID, if (next.isOnReminder) 4101 else 4102)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            4100,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.triggerAtMillis, pendingIntent)
    }

    private fun reminderAt(time: String, isOnReminder: Boolean): ReminderTime? {
        val parts = time.split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: return null
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: return null
        if (hour !in 0..23 || minute !in 0..59) return null
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (calendar.timeInMillis <= System.currentTimeMillis()) {
            calendar.add(Calendar.DAY_OF_YEAR, 1)
        }
        return ReminderTime(calendar.timeInMillis, isOnReminder)
    }

    private data class ReminderTime(val triggerAtMillis: Long, val isOnReminder: Boolean)
}
