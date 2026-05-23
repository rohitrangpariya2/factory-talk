package com.factorytalk.app.data.repository

import com.factorytalk.app.data.model.User
import kotlinx.coroutines.flow.Flow

interface UserRepository {
    fun getCurrentUser(): Flow<User?>
    fun getUsers(): Flow<List<User>>
    suspend fun updateProfile(displayName: String)
    suspend fun updateFcmToken(token: String)
}
