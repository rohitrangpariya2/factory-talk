package com.factorytalk.app.data.model

data class TalkSession(
    val channelId: String,
    val speakerUserId: String,
    val speakerName: String,
    val speakerRole: UserRole,
    val startTime: Long = System.currentTimeMillis(),
    val isPrivate: Boolean = false
)
