package com.factorytalk.app.data.model

data class User(
    val id: String = "",
    val phoneNumber: String = "",
    val displayName: String = "",
    val role: UserRole = UserRole.WORKER,
    val fcmToken: String? = null,
    val isOnline: Boolean = false,
    val lastSeen: Long = 0,
    val channels: List<String> = emptyList(),
    val permissions: Permissions = Permissions(),
    val isMuted: Boolean = false,
    val isBlocked: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
)

data class Permissions(
    val canTalk: Boolean = true,
    val canPrivateTalk: Boolean = true
)
