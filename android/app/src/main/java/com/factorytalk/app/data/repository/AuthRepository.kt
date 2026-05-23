package com.factorytalk.app.data.repository

import android.app.Activity
import com.google.firebase.auth.FirebaseUser

interface AuthRepository {
    suspend fun sendOtp(phoneNumber: String, activity: Activity): Result<String>
    suspend fun verifyOtp(verificationId: String, code: String): Result<FirebaseUser>
    fun getCurrentUser(): FirebaseUser?
    fun signOut()
    suspend fun getIdToken(): String?
}
