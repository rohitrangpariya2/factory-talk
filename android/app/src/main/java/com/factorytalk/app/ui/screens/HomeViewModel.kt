package com.factorytalk.app.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.factorytalk.app.audio.FloorControlManager
import com.factorytalk.app.data.model.Channel
import com.factorytalk.app.data.model.ConnectionState
import com.factorytalk.app.data.model.FloorState
import com.factorytalk.app.data.model.TalkSession
import com.factorytalk.app.data.model.User
import com.factorytalk.app.data.model.UserRole
import com.factorytalk.app.data.remote.SignalingClient
import com.factorytalk.app.data.repository.ChannelRepository
import com.factorytalk.app.data.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val channelRepository: ChannelRepository,
    private val signalingClient: SignalingClient,
    private val floorControlManager: FloorControlManager
) : ViewModel() {

    val currentUser = userRepository.getCurrentUser()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val connectionState = signalingClient.connectionState
    val floorState = floorControlManager.floorState
    val currentSpeaker = floorControlManager.currentSpeaker
    val talkDurationSeconds = floorControlManager.talkDurationSeconds

    private val _onlineUsers = MutableStateFlow<List<User>>(emptyList())
    val onlineUsers: StateFlow<List<User>> = _onlineUsers.asStateFlow()

    private val _currentChannel = MutableStateFlow<Channel?>(null)
    val currentChannel: StateFlow<Channel?> = _currentChannel.asStateFlow()

    init {
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            // Get channels
            channelRepository.getChannels().collect { channels ->
                // Default to first channel, which should be COMMON
                val commonChannel = channels.find { it.type == com.factorytalk.app.data.model.ChannelType.COMMON }
                    ?: channels.firstOrNull()
                
                if (commonChannel != null && _currentChannel.value == null) {
                    _currentChannel.value = commonChannel
                    // Note: Joining channel via socket should happen from the UI or Service
                    // to ensure foreground service rules are respected
                }
            }
        }

        viewModelScope.launch {
            // Listen for users
            userRepository.getUsers().collect { users ->
                _onlineUsers.value = users.filter { it.isOnline }.sortedByDescending { it.role.priority }
            }
        }
    }

    fun requestFloor() {
        _currentChannel.value?.id?.let {
            floorControlManager.requestFloor(it)
        }
    }

    fun releaseFloor() {
        _currentChannel.value?.id?.let {
            floorControlManager.releaseFloor(it)
        }
    }
    
    fun sendEmergencyBroadcast() {
        // TODO: Call API endpoint to trigger emergency push notification
        // For now, request floor which will override anyone due to OWNER/ADMIN priority
        requestFloor()
    }
}
