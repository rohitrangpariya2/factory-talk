package com.factorytalk.app.data.repository

import android.content.SharedPreferences
import com.factorytalk.app.data.demo.DemoData
import com.factorytalk.app.data.demo.DeviceIdentityProvider
import com.factorytalk.app.data.model.User
import com.factorytalk.app.data.remote.FirestoreDataSource
import com.factorytalk.app.util.Constants
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject

class UserRepositoryImpl @Inject constructor(
    private val firestoreDataSource: FirestoreDataSource,
    private val auth: FirebaseAuth,
    private val deviceIdentityProvider: DeviceIdentityProvider,
    private val sharedPreferences: SharedPreferences
) : UserRepository {

    override fun getCurrentUser(): Flow<User?> {
        if (Constants.DEMO_MODE) {
            return callbackFlow {
                fun sendCurrentUser() {
                    trySend(DemoData.currentUser(deviceIdentityProvider.getDeviceId(), deviceIdentityProvider.getDeviceName()))
                }

                val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                    if (key == Constants.PREF_DEVICE_NAME) sendCurrentUser()
                }

                sendCurrentUser()
                sharedPreferences.registerOnSharedPreferenceChangeListener(listener)
                awaitClose { sharedPreferences.unregisterOnSharedPreferenceChangeListener(listener) }
            }
        }

        return flow {
            val uid = auth.currentUser?.uid
            if (uid != null) {
                emit(firestoreDataSource.getUser(uid))
            } else {
                emit(null)
            }
        }
    }

    override fun getUsers(): Flow<List<User>> {
        if (Constants.DEMO_MODE) {
            return callbackFlow {
                fun sendUsers() {
                    trySend(DemoData.users(deviceIdentityProvider.getDeviceId(), deviceIdentityProvider.getDeviceName()))
                }

                val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                    if (key == Constants.PREF_DEVICE_NAME) sendUsers()
                }

                sendUsers()
                sharedPreferences.registerOnSharedPreferenceChangeListener(listener)
                awaitClose { sharedPreferences.unregisterOnSharedPreferenceChangeListener(listener) }
            }
        }

        return flow {
            emit(firestoreDataSource.getAllUsers())
        }
    }

    override suspend fun updateProfile(displayName: String) {
        if (Constants.DEMO_MODE) {
            deviceIdentityProvider.setDeviceName(displayName)
            return
        }

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
