package com.factorytalk.app.data.remote

import com.factorytalk.app.data.model.Channel
import com.factorytalk.app.data.model.User
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

class FirestoreDataSource @Inject constructor(
    private val firestore: FirebaseFirestore
) {
    private val usersRef = firestore.collection("users")
    private val channelsRef = firestore.collection("channels")

    suspend fun saveUser(user: User) {
        usersRef.document(user.id).set(user).await()
    }

    suspend fun getUser(userId: String): User? {
        val snapshot = try {
            usersRef.document(userId).get().await()
        } catch (e: Exception) {
            null
        }
        return snapshot?.toObject(User::class.java)
    }

    suspend fun updateFcmToken(userId: String, token: String) {
        usersRef.document(userId).update("fcmToken", token).await()
    }

    suspend fun updateOnlineStatus(userId: String, isOnline: Boolean) {
        usersRef.document(userId).update(
            mapOf(
                "isOnline" to isOnline,
                "lastSeen" to System.currentTimeMillis()
            )
        ).await()
    }

    suspend fun getAllUsers(): List<User> {
        val snapshot = try {
            usersRef.get().await()
        } catch (e: Exception) {
            null
        }
        return snapshot?.toObjects(User::class.java) ?: emptyList()
    }

    suspend fun getChannels(userId: String): List<Channel> {
        // First get common channels
        val commonSnapshot = try {
            channelsRef.whereEqualTo("type", "COMMON").get().await()
        } catch (e: Exception) {
            null
        }
        val commonChannels = commonSnapshot?.toObjects(Channel::class.java) ?: emptyList()
        
        // Then get department channels where user is a member
        // Fetch by members first to avoid needing a composite index in Firestore
        val deptSnapshot = try {
            channelsRef
                .whereArrayContains("members", userId)
                .get().await()
        } catch (e: Exception) {
            // Fallback empty if any other error
            null
        }
        
        val deptChannels = deptSnapshot?.toObjects(Channel::class.java)
            ?.filter { it.type == com.factorytalk.app.data.model.ChannelType.DEPARTMENT }
            ?: emptyList()
        
        return (commonChannels + deptChannels).distinctBy { it.id }
    }

    suspend fun createChannel(channel: Channel) {
        channelsRef.document(channel.id).set(channel).await()
    }

    suspend fun updateChannel(channel: Channel) {
        channelsRef.document(channel.id).set(channel).await()
    }

    suspend fun deleteChannel(channelId: String) {
        channelsRef.document(channelId).delete().await()
    }
}
