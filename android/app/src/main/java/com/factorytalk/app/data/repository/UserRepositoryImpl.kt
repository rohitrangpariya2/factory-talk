package com.factorytalk.app.data.repository

import com.factorytalk.app.data.demo.DemoData
import com.factorytalk.app.data.demo.DeviceIdentityProvider
import com.factorytalk.app.data.model.User
import com.factorytalk.app.data.remote.FirestoreDataSource
import com.factorytalk.app.util.Constants
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject

class UserRepositoryImpl @Inject constructor(
    private val firestoreDataSource: FirestoreDataSource,
    private val auth: FirebaseAuth,
    private val deviceIdentityProvider: DeviceIdentityProvider
) : UserRepository {

    override fun getCurrentUser(): Flow<User?> = flow {
        if (Constants.DEMO_MODE) {
            emit(DemoData.currentUser(deviceIdentityProvider.getDeviceId(), deviceIdentityProvider.getDeviceName()))
            return@flow
        }

        val uid = auth.currentUser?.uid
        if (uid != null) {
            emit(firestoreDataSource.getUser(uid))
        } else {
            emit(null)
        }
    }

    override fun getUsers(): Flow<List<User>> = flow {
        if (Constants.DEMO_MODE) {
            emit(DemoData.users(deviceIdentityProvider.getDeviceId(), deviceIdentityProvider.getDeviceName()))
            return@flow
        }

        emit(firestoreDataSource.getAllUsers())
    }

    override suspend fun updateProfile(displayName: String) {
        if (Constants.DEMO_MODE) return

        val uid = auth.currentUser?.uid ?: return
        val user = firestoreDataSource.getUser(uid)
        if (user != null) {
            firestoreDataSource.saveUser(user.copy(displayName = displayName))
        }
    }

    override suspend fun updateFcmToken(token: String) {
        if (Constants.DEMO_MODE) return

        val uid = auth.currentUser?.uid ?: return
        firestoreDataSource.updateFcmToken(uid, token)
    }
}
