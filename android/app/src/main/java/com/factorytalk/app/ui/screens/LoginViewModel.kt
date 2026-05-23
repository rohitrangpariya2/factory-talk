package com.factorytalk.app.ui.screens

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.factorytalk.app.data.model.User
import com.factorytalk.app.data.repository.AuthRepository
import com.factorytalk.app.data.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<LoginUiState>(LoginUiState.PhoneInput)
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    private var verificationId: String? = null
    var phoneNumber = ""

    init {
        checkExistingSession()
    }

    private fun checkExistingSession() {
        val user = authRepository.getCurrentUser()
        if (user != null) {
            viewModelScope.launch {
                userRepository.getCurrentUser().collect { dbUser ->
                    if (dbUser != null) {
                        _uiState.value = LoginUiState.Success
                    } else {
                        // User exists in Auth but not in Firestore (first login)
                        _uiState.value = LoginUiState.ProfileSetup
                    }
                }
            }
        }
    }

    fun sendOtp(phone: String, activity: Activity) {
        phoneNumber = phone
        _uiState.value = LoginUiState.Loading("Sending OTP...")
        
        viewModelScope.launch {
            val result = authRepository.sendOtp(phone, activity)
            result.onSuccess { vId ->
                verificationId = vId
                _uiState.value = LoginUiState.OtpInput
            }.onFailure { e ->
                _uiState.value = LoginUiState.Error(e.message ?: "Failed to send OTP", LoginUiState.PhoneInput)
            }
        }
    }

    fun verifyOtp(code: String) {
        val vId = verificationId ?: return
        _uiState.value = LoginUiState.Loading("Verifying...")
        
        viewModelScope.launch {
            val result = authRepository.verifyOtp(vId, code)
            result.onSuccess { user ->
                // Check if user exists in Firestore
                val dbUser = userRepository.getCurrentUser().firstOrNull()
                if (dbUser != null) {
                    _uiState.value = LoginUiState.Success
                } else {
                    _uiState.value = LoginUiState.ProfileSetup
                }
            }.onFailure { e ->
                _uiState.value = LoginUiState.Error(e.message ?: "Invalid OTP", LoginUiState.OtpInput)
            }
        }
    }

    fun saveProfile(displayName: String) {
        _uiState.value = LoginUiState.Loading("Saving profile...")
        
        viewModelScope.launch {
            try {
                userRepository.updateProfile(displayName)
                _uiState.value = LoginUiState.Success
            } catch (e: Exception) {
                _uiState.value = LoginUiState.Error(e.message ?: "Failed to save profile", LoginUiState.ProfileSetup)
            }
        }
    }
}

sealed class LoginUiState {
    object PhoneInput : LoginUiState()
    object OtpInput : LoginUiState()
    object ProfileSetup : LoginUiState()
    data class Loading(val message: String) : LoginUiState()
    data class Error(val message: String, val previousState: LoginUiState) : LoginUiState()
    object Success : LoginUiState()
}

