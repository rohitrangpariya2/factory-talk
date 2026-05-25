package com.factorytalk.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.factorytalk.app.data.model.Channel
import com.factorytalk.app.data.model.ChannelType
import com.factorytalk.app.data.model.User
import com.factorytalk.app.data.remote.SignalingClient
import com.factorytalk.app.data.repository.ChannelRepository
import com.factorytalk.app.service.ReminderScheduler
import com.factorytalk.app.service.TalkForegroundService
import com.factorytalk.app.util.Constants
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class AdminViewModel @Inject constructor(
    private val channelRepository: ChannelRepository,
    private val signalingClient: SignalingClient
) : ViewModel() {
    val channels = channelRepository.getChannels()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val onlineUsers = signalingClient.onlineUsers
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun addDepartmentChannel(department: String, channelName: String) {
        val cleanDepartment = department.trim()
        val cleanChannel = channelName.trim()
        if (cleanDepartment.isBlank() || cleanChannel.isBlank()) return

        viewModelScope.launch {
            channelRepository.createChannel(
                name = cleanChannel,
                type = ChannelType.DEPARTMENT,
                department = cleanDepartment
            )
        }
    }

    fun deleteChannel(channel: Channel) {
        viewModelScope.launch {
            channelRepository.deleteChannel(channel.id)
        }
    }

    fun setReminderSchedule(onTime: String, offTime: String) {
        signalingClient.setReminderSchedule(onTime, offTime)
    }

    init {
        viewModelScope.launch {
            while (true) {
                signalingClient.requestLocations()
                delay(5_000L)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(
    viewModel: AdminViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val channels by viewModel.channels.collectAsState()
    val onlineUsers by viewModel.onlineUsers.collectAsState()
    val prefs = remember { context.getSharedPreferences(Constants.PREFS_NAME, android.content.Context.MODE_PRIVATE) }
    var department by remember { mutableStateOf("") }
    var channelName by remember { mutableStateOf("") }
    var onTime by remember { mutableStateOf(prefs.getString(Constants.PREF_REMINDER_ON_TIME, "09:00") ?: "09:00") }
    var offTime by remember { mutableStateOf(prefs.getString(Constants.PREF_REMINDER_OFF_TIME, "20:00") ?: "20:00") }
    var currentPin by remember { mutableStateOf("") }
    var newPin by remember { mutableStateOf("") }
    var pinMessage by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin Panel", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.medium
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Admin Access",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Aa phone Admin che. Staff phone ma Admin Panel kholva PIN joie.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedTextField(
                            value = currentPin,
                            onValueChange = {
                                currentPin = it.take(8)
                                pinMessage = ""
                            },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            label = { Text("Current PIN") },
                            placeholder = { Text(Constants.DEFAULT_ADMIN_PIN) }
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = newPin,
                            onValueChange = {
                                newPin = it.take(8)
                                pinMessage = ""
                            },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            label = { Text("New PIN") }
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = {
                                    val savedPin = prefs.getString(Constants.PREF_ADMIN_PIN, Constants.DEFAULT_ADMIN_PIN)
                                        ?: Constants.DEFAULT_ADMIN_PIN
                                    pinMessage = if (currentPin == savedPin && newPin.length >= 4) {
                                        prefs.edit().putString(Constants.PREF_ADMIN_PIN, newPin).apply()
                                        currentPin = ""
                                        newPin = ""
                                        "PIN saved"
                                    } else {
                                        "Current PIN wrong or new PIN short"
                                    }
                                },
                                enabled = currentPin.isNotBlank() && newPin.isNotBlank()
                            ) {
                                Text("Save PIN")
                            }
                            Button(
                                onClick = {
                                    prefs.edit().putBoolean(Constants.PREF_DEVICE_IS_ADMIN, false).apply()
                                    context.startService(Intent(context, TalkForegroundService::class.java).apply {
                                        action = Constants.ACTION_REFRESH_IDENTITY
                                    })
                                    pinMessage = "This phone is Staff now"
                                }
                            ) {
                                Text("Make Staff")
                            }
                        }
                        if (pinMessage.isNotBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = pinMessage,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }

            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.medium
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Walkie Talkie Reminder",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = onTime,
                                onValueChange = { onTime = it.take(5) },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                                label = { Text("ON time") },
                                placeholder = { Text("09:00") }
                            )
                            OutlinedTextField(
                                value = offTime,
                                onValueChange = { offTime = it.take(5) },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                                label = { Text("OFF time") },
                                placeholder = { Text("20:00") }
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = {
                                ReminderScheduler.saveSchedule(context, onTime, offTime)
                                viewModel.setReminderSchedule(onTime, offTime)
                            },
                            enabled = isValidTime(onTime) && isValidTime(offTime)
                        ) {
                            Text("Save & Send to all phones")
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Aa schedule connected phones ne moklavse. Offline phone reconnect thase tyare schedule receive karse.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            item {
                DutyLocationsCard(users = onlineUsers)
            }

            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.medium
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Departments / Channels",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedTextField(
                            value = department,
                            onValueChange = { department = it.take(24) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            label = { Text("Department") }
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = channelName,
                            onValueChange = { channelName = it.take(28) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            label = { Text("Channel name") }
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = {
                                viewModel.addDepartmentChannel(department, channelName)
                                department = ""
                                channelName = ""
                            },
                            enabled = department.isNotBlank() && channelName.isNotBlank()
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null)
                            Text("Add")
                        }
                    }
                }
            }

            items(channels) { channel ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surface,
                    shape = MaterialTheme.shapes.medium
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = channel.name,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = channel.department ?: "General",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        IconButton(
                            onClick = { viewModel.deleteChannel(channel) },
                            enabled = channel.id != Constants.DEMO_CHANNEL_ID
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete channel")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DutyLocationsCard(users: List<User>) {
    val context = LocalContext.current
    val locationUsers = users.filter { it.latitude != null && it.longitude != null && it.locationUpdatedAt > 0 }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Live Location Tracking",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            if (locationUsers.isEmpty()) {
                Text(
                    text = "Koi phone e location sharing ON kari nathi athva location haju receive nathi thayu.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                return@Column
            }
            locationUsers.forEach { user ->
                val latitude = user.latitude ?: return@forEach
                val longitude = user.longitude ?: return@forEach
                Text(
                    text = user.displayName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Live point: ${"%.5f".format(latitude)}, ${"%.5f".format(longitude)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "Last: ${formatLocationTime(user.locationUpdatedAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(6.dp))
                Button(
                    onClick = {
                        val uri = Uri.parse("geo:$latitude,$longitude?q=$latitude,$longitude(${Uri.encode(user.displayName)})")
                        val mapIntent = Intent(Intent.ACTION_VIEW, uri)
                        runCatching { context.startActivity(mapIntent) }
                    }
                ) {
                    Text("Track on Map")
                }
                Spacer(modifier = Modifier.height(10.dp))
            }
        }
    }
}

private fun formatLocationTime(timestamp: Long): String {
    return SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault()).format(Date(timestamp))
}

private fun isValidTime(time: String): Boolean {
    val parts = time.split(":")
    val hour = parts.getOrNull(0)?.toIntOrNull()
    val minute = parts.getOrNull(1)?.toIntOrNull()
    return parts.size == 2 && hour in 0..23 && minute in 0..59
}
