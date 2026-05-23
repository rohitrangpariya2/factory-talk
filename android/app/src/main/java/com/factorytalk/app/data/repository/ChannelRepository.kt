package com.factorytalk.app.data.repository

import com.factorytalk.app.data.model.Channel
import com.factorytalk.app.data.model.ChannelType
import kotlinx.coroutines.flow.Flow

interface ChannelRepository {
    fun getChannels(): Flow<List<Channel>>
    suspend fun createChannel(name: String, type: ChannelType, department: String? = null): Channel
    suspend fun deleteChannel(channelId: String)
    suspend fun addMember(channelId: String, userId: String)
    suspend fun removeMember(channelId: String, userId: String)
}
