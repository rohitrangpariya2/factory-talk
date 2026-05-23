package com.factorytalk.app.data.repository

import com.factorytalk.app.data.demo.DemoData
import com.factorytalk.app.data.demo.DeviceIdentityProvider
import com.factorytalk.app.data.model.Channel
import com.factorytalk.app.data.model.ChannelType
import com.factorytalk.app.data.remote.FirestoreDataSource
import com.factorytalk.app.util.Constants
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.util.UUID
import javax.inject.Inject

class ChannelRepositoryImpl @Inject constructor(
    private val firestoreDataSource: FirestoreDataSource,
    private val auth: FirebaseAuth,
    private val deviceIdentityProvider: DeviceIdentityProvider
) : ChannelRepository {

    override fun getChannels(): Flow<List<Channel>> = flow {
        if (Constants.DEMO_MODE) {
            emit(DemoData.channels(deviceIdentityProvider.getDeviceId(), deviceIdentityProvider.getDeviceName()))
            return@flow
        }

        val uid = auth.currentUser?.uid ?: return@flow
        emit(firestoreDataSource.getChannels(uid))
    }

    override suspend fun createChannel(name: String, type: ChannelType, department: String?): Channel {
        if (Constants.DEMO_MODE) {
            return Channel(
                id = "demo-${name.lowercase().replace(" ", "-")}",
                name = name,
                type = type,
                department = department,
                members = DemoData.users(deviceIdentityProvider.getDeviceId(), deviceIdentityProvider.getDeviceName()).map { it.id },
                createdBy = deviceIdentityProvider.getDeviceId()
            )
        }

        val uid = auth.currentUser?.uid ?: throw IllegalStateException("User not logged in")
        val channel = Channel(
            id = UUID.randomUUID().toString(),
            name = name,
            type = type,
            department = department,
            members = listOf(uid),
            createdBy = uid
        )
        firestoreDataSource.createChannel(channel)
        return channel
    }

    override suspend fun deleteChannel(channelId: String) {
        if (Constants.DEMO_MODE) return

        firestoreDataSource.deleteChannel(channelId)
    }

    override suspend fun addMember(channelId: String, userId: String) {
        if (Constants.DEMO_MODE) return

        val channels = firestoreDataSource.getChannels(auth.currentUser?.uid ?: return)
        val channel = channels.find { it.id == channelId } ?: return
        
        if (!channel.members.contains(userId)) {
            val updatedMembers = channel.members + userId
            firestoreDataSource.updateChannel(channel.copy(members = updatedMembers))
        }
    }

    override suspend fun removeMember(channelId: String, userId: String) {
        if (Constants.DEMO_MODE) return

        val channels = firestoreDataSource.getChannels(auth.currentUser?.uid ?: return)
        val channel = channels.find { it.id == channelId } ?: return
        
        if (channel.members.contains(userId)) {
            val updatedMembers = channel.members - userId
            firestoreDataSource.updateChannel(channel.copy(members = updatedMembers))
        }
    }
}
