package com.factorytalk.app.util

import com.factorytalk.app.BuildConfig

object Constants {
    // Demo Mode
    // Keeps the app usable on one phone without Firebase phone login.
    const val DEMO_MODE = true
    const val DEMO_USER_ID = "demo-owner"
    const val DEMO_USER_NAME = "Demo Owner"
    const val DEMO_CHANNEL_ID = "demo-common"
    const val DEMO_CHANNEL_NAME = "Common Channel"

    // Server Configuration
    // Changed for physical device testing
    const val SERVER_URL = BuildConfig.SERVER_URL
    const val SERVER_HEALTH_TIMEOUT_MS = 10_000
    const val SERVER_KEEP_ALIVE_INTERVAL_MS = 3 * 60 * 1000L
    const val SERVICE_WATCHDOG_INTERVAL_MS = 2 * 60 * 1000L
    
    // Notification Channels
    const val NOTIFICATION_CHANNEL_PTT_SERVICE = "ptt_service_channel"
    const val NOTIFICATION_CHANNEL_INCOMING = "ptt_incoming_channel"
    const val NOTIFICATION_CHANNEL_EMERGENCY = "ptt_emergency_channel"
    
    // Notification IDs
    const val NOTIFICATION_ID_FOREGROUND = 1001
    const val NOTIFICATION_ID_INCOMING = 1002
    const val NOTIFICATION_ID_EMERGENCY = 1003
    
    // Service Actions
    const val ACTION_START_SERVICE = "com.factorytalk.app.action.START_SERVICE"
    const val ACTION_STOP_SERVICE = "com.factorytalk.app.action.STOP_SERVICE"
    const val ACTION_RESTART_SERVICE = "com.factorytalk.app.action.RESTART_SERVICE"
    const val ACTION_SERVICE_WATCHDOG = "com.factorytalk.app.action.SERVICE_WATCHDOG"
    const val ACTION_REFRESH_IDENTITY = "com.factorytalk.app.action.REFRESH_IDENTITY"
    const val ACTION_START_TALKING = "com.factorytalk.app.action.START_TALKING"
    const val ACTION_STOP_TALKING = "com.factorytalk.app.action.STOP_TALKING"
    const val ACTION_JOIN_CHANNEL = "com.factorytalk.app.action.JOIN_CHANNEL"
    const val ACTION_LEAVE_CHANNEL = "com.factorytalk.app.action.LEAVE_CHANNEL"
    const val ACTION_INCOMING_BROADCAST = "com.factorytalk.app.action.INCOMING_BROADCAST"
    
    // Intent Extras
    const val EXTRA_CHANNEL_ID = "extra_channel_id"
    const val EXTRA_SPEAKER_NAME = "extra_speaker_name"
    const val EXTRA_TARGET_USER_ID = "extra_target_user_id"
    
    // Shared Preferences
    const val PREFS_NAME = "factory_talk_prefs"
    const val PREF_IS_FIRST_LAUNCH = "is_first_launch"
    const val PREF_BATTERY_OPTIMIZATION_SKIPPED = "battery_optimization_skipped"
    const val PREF_DEVICE_NAME = "device_name"
    const val PREF_DEMO_CHANNELS = "demo_channels"
    
    // PTT Config
    const val MAX_TALK_DURATION_SECONDS = 60
}
