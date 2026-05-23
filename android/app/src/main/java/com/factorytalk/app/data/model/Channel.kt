package com.factorytalk.app.data.model

data class Channel(
    val id: String = "",
    val name: String = "",
    val type: ChannelType = ChannelType.COMMON,
    val department: String? = null,
    val members: List<String> = emptyList(),
    val createdBy: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

enum class ChannelType {
    COMMON,
    DEPARTMENT
}
