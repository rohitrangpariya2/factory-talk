package com.factorytalk.app.data.repository

import android.content.SharedPreferences
import com.factorytalk.app.data.demo.DemoData
import com.factorytalk.app.data.demo.DeviceIdentityProvider
import com.factorytalk.app.data.model.Channel
import com.factorytalk.app.data.model.ChannelType
import com.factorytalk.app.data.remote.FirestoreDataSource
import com.factorytalk.app.util.Constants
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import javax.inject.Inject

class ChannelRepositoryImpl @Inject constructor(
    private val firestoreDataSource: FirestoreDataSource,
    private val auth: FirebaseAuth,
    private val deviceIdentityProvider: DeviceIdentityProvider,
    private val sharedPreferences: SharedPreferences
) : ChannelRepository {
    private val demoChannels = MutableStateFlow(loadDemoChannels())

    override fun getChannels(): Flow<List<Channel>> {
        if (Constants.DEMO_MODE) {
            return demoChannels
        }

        return flow {
            val uid = auth.currentUser?.uid ?: return@flow
            emit(firestoreDataSource.getChannels(uid))
        }
    }

    override suspend fun createChannel(name: String, type: ChannelType, department: String?): Channel {
        if (Constants.DEMO_MODE) {
            val channel = Channel(
                id = "demo-${UUID.randomUUID()}",
                name = name,
                type = type,
                department = department,
                members = DemoData.users(deviceIdentityProvider.getDeviceId(), deviceIdentityProvider.getDeviceName()).map { it.id },
                createdBy = deviceIdentityProvider.getDeviceId()
            )
            val updatedChannels = demoChannels.value + channel
            saveDemoChannels(updatedChannels)
            demoChannels.value = updatedChannels
            return channel
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
        if (Constants.DEMO_MODE) {
            if (channelId == Constants.DEMO_CHANNEL_ID) return
            val updatedChannels = demoChannels.value.filterNot { it.id == channelId }
            saveDemoChannels(updatedChannels)
            demoChannels.value = updatedChannels
            return
        }

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

    private fun loadDemoChannels(): List<Channel> {
        val defaultChannels = DemoData.channels(deviceIdentityProvider.getDeviceId(), deviceIdentityProvider.getDeviceName())
        val raw = sharedPreferences.getString(Constants.PREF_DEMO_CHANNELS, null) ?: return defaultChannels

        return runCatching {
            val array = JSONArray(raw)
            buildList {
                addAll(defaultChannels)
                for (i in 0 until array.length()) {
                    val item = array.getJSONObject(i)
                    val id = item.optString("id")
                    if (id.isBlank() || id == Constants.DEMO_CHANNEL_ID) continue
                    add(
                        Channel(
                            id = id,
                            name = item.optString("name", "Department"),
                            type = ChannelType.valueOf(item.optString("type", ChannelType.DEPARTMENT.name)),
                            department = item.optString("department").ifBlank { null },
                            members = DemoData.users(deviceIdentityProvider.getDeviceId(), deviceIdentityProvider.getDeviceName()).map { it.id },
                            createdBy = item.optString("createdBy", deviceIdentityProvider.getDeviceId()),
                            createdAt = item.optLong("createdAt", System.currentTimeMillis())
                        )
                    )
                }
            }.distinctBy { it.id }
        }.getOrDefault(defaultChannels)
    }

    private fun saveDemoChannels(channels: List<Channel>) {
        val array = JSONArray()
        channels
            .filterNot { it.id == Constants.DEMO_CHANNEL_ID }
            .forEach { channel ->
                array.put(JSONObject().apply {
                    put("id", channel.id)
                    put("name", channel.name)
                    put("type", channel.type.name)
                    put("department", channel.department ?: "")
                    put("createdBy", channel.createdBy)
                    put("createdAt", channel.createdAt)
                })
            }
        sharedPreferences.edit().putString(Constants.PREF_DEMO_CHANNELS, array.toString()).apply()
    }
}
