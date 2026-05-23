package com.factorytalk.app.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.factorytalk.app.MainActivity
import com.factorytalk.app.R
import com.factorytalk.app.data.repository.UserRepository
import com.factorytalk.app.util.Constants
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class FCMService : FirebaseMessagingService() {

    @Inject
    lateinit var userRepository: UserRepository

    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("FCMService", "Refreshed token: $token")
        scope.launch {
            userRepository.updateFcmToken(token)
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        
        Log.d("FCMService", "From: ${remoteMessage.from}")
        
        if (remoteMessage.data.isNotEmpty()) {
            handleDataMessage(remoteMessage.data)
        }
    }

    private fun handleDataMessage(data: Map<String, String>) {
        val type = data["type"]
        val channelId = data["channel_id"]
        val speakerName = data["speaker_name"]
        
        when (type) {
            "incoming_ptt" -> {
                // High priority wake-up for incoming broadcast
                if (channelId != null && speakerName != null) {
                    val startIntent = Intent(this, TalkForegroundService::class.java).apply {
                        action = Constants.ACTION_INCOMING_BROADCAST
                        putExtra(Constants.EXTRA_CHANNEL_ID, channelId)
                        putExtra(Constants.EXTRA_SPEAKER_NAME, speakerName)
                    }
                    
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(startIntent)
                    } else {
                        startService(startIntent)
                    }
                }
            }
            "private_talk" -> {
                // TODO: Show notification for incoming private talk
            }
            "emergency" -> {
                // Show high priority emergency notification
                showEmergencyNotification(data)
                
                // Also start service to hear it
                val channelId = data["channel_id"]
                val speakerName = data["speaker_name"]
                if (channelId != null && speakerName != null) {
                    val startIntent = Intent(this, TalkForegroundService::class.java).apply {
                        action = Constants.ACTION_INCOMING_BROADCAST
                        putExtra(Constants.EXTRA_CHANNEL_ID, channelId)
                        putExtra(Constants.EXTRA_SPEAKER_NAME, speakerName)
                    }
                    
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(startIntent)
                    } else {
                        startService(startIntent)
                    }
                }
            }
        }
    }

    private fun showEmergencyNotification(data: Map<String, String>) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                Constants.NOTIFICATION_CHANNEL_EMERGENCY,
                "Emergency Broadcasts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Critical alerts for the factory"
            }
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra(Constants.EXTRA_CHANNEL_ID, data["channel_id"])
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val speakerName = data["speaker_name"] ?: "Admin"
        
        val notification = NotificationCompat.Builder(this, Constants.NOTIFICATION_CHANNEL_EMERGENCY)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("EMERGENCY BROADCAST")
            .setContentText("$speakerName is broadcasting an emergency message!")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(pendingIntent, true)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(Constants.NOTIFICATION_ID_EMERGENCY, notification)
    }
}
