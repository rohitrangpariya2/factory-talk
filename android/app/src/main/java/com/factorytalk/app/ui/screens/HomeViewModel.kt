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
import com.factorytalk.app.data.remote.SignalingEvent
import com.factorytalk.app.data.remote.ServerHealthMonitor
import com.factorytalk.app.data.repository.ChannelRepository
import com.factorytalk.app.data.repository.UserRepository
import com.factorytalk.app.util.Constants
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val channelRepository: ChannelRepository,
    private val signalingClient: SignalingClient,
    private val floorControlManager: FloorControlManager,
    private val serverHealthMonitor: ServerHealthMonitor
) : ViewModel() {

    val currentUser = userRepository.getCurrentUser()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val connectionState = signalingClient.connectionState
    val floorState = floorControlManager.floorState
    val serverHealthStatus = serverHealthMonitor.status
    val currentSpeaker = floorControlManager.currentSpeaker
    val talkDurationSeconds = floorControlManager.talkDurationSeconds

    val onlineUsers: StateFlow<List<User>> = signalingClient.onlineUsers

    private val _currentChannel = MutableStateFlow<Channel?>(null)
    val currentChannel: StateFlow<Channel?> = _currentChannel.asStateFlow()
    private val _channels = MutableStateFlow<List<Channel>>(emptyList())
    val channels: StateFlow<List<Channel>> = _channels.asStateFlow()

    init {
        serverHealthMonitor.start(Constants.SERVER_URL)
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            // Get channels
            channelRepository.getChannels().collect { channels ->
                _channels.value = channels
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

    fun saveDeviceName(name: String) {
        val cleanedName = name.trim()
        if (cleanedName.isBlank()) return

        viewModelScope.launch {
            userRepository.updateProfile(cleanedName)
        }
    }

    fun selectChannel(channel: Channel) {
        _currentChannel.value = channel
    }
    
    fun sendEmergencyBroadcast() {
        // TODO: Call API endpoint to trigger emergency push notification
        // For now, request floor which will override anyone due to OWNER/ADMIN priority
        requestFloor()
    }
}
