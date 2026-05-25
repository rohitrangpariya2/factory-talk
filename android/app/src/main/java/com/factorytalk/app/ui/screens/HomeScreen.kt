package com.factorytalk.app.ui.screens

import android.app.Activity
import android.content.Intent
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.factorytalk.app.R
import com.factorytalk.app.data.model.FloorState
import com.factorytalk.app.data.model.UserRole
import com.factorytalk.app.service.TalkForegroundService
import com.factorytalk.app.ui.components.EmergencyButton
import com.factorytalk.app.ui.components.RoleBadge
import com.factorytalk.app.ui.components.StatusBar
import com.factorytalk.app.ui.components.TalkButton
import com.factorytalk.app.ui.theme.OnlineGreen
import com.factorytalk.app.util.CallStateHelper
import com.factorytalk.app.util.Constants
import com.factorytalk.app.util.PermissionHelper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToPrivateTalk: () -> Unit,
    onNavigateToAdmin: () -> Unit,
    onNavigateToUserList: () -> Unit,
    onNavigateToSetupCheck: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val currentUser by viewModel.currentUser.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()
    val serverHealthStatus by viewModel.serverHealthStatus.collectAsState()
    val currentChannel by viewModel.currentChannel.collectAsState()
    val channels by viewModel.channels.collectAsState()
    val floorState by viewModel.floorState.collectAsState()
    val currentSpeaker by viewModel.currentSpeaker.collectAsState()
    val onlineUsers by viewModel.onlineUsers.collectAsState()
    val talkDuration by viewModel.talkDurationSeconds.collectAsState()
    var showNameDialog by remember { mutableStateOf(false) }
    var deviceNameInput by remember(currentUser?.displayName) {
        mutableStateOf(currentUser?.displayName.orEmpty())
    }
    val requiredPermissions = remember { PermissionHelper.requiredPermissions }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[android.Manifest.permission.RECORD_AUDIO] == true) {
            currentChannel?.let { channel ->
                val startIntent = Intent(context, TalkForegroundService::class.java).apply {
                    action = Constants.ACTION_START_SERVICE
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(startIntent)
                } else {
                    context.startService(startIntent)
                }
                context.startService(Intent(context, TalkForegroundService::class.java).apply {
                    action = Constants.ACTION_JOIN_CHANNEL
                    putExtra(Constants.EXTRA_CHANNEL_ID, channel.id)
                })
            }
        }
    }

    LaunchedEffect(Unit) {
        val missingPermissions = PermissionHelper.getMissingPermissions(context)
        if (missingPermissions.isNotEmpty()) {
            permissionLauncher.launch(missingPermissions.toTypedArray())
        }
    }

    // Start foreground service when Home opens
    LaunchedEffect(currentChannel) {
        currentChannel?.let { channel ->
            if (PermissionHelper.hasRecordAudioPermission(context)) {
                try {
                    val intent = Intent(context, TalkForegroundService::class.java).apply {
                        action = Constants.ACTION_START_SERVICE
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                    
                    // Send join action
                    val joinIntent = Intent(context, TalkForegroundService::class.java).apply {
                        action = Constants.ACTION_JOIN_CHANNEL
                        putExtra(Constants.EXTRA_CHANNEL_ID, channel.id)
                    }
                    context.startService(joinIntent)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = {
                        Column {
                            Text("Factory Talk", fontWeight = FontWeight.Bold)
                            Text(
                                text = currentUser?.displayName ?: "Factory Phone",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background
                    ),
                    actions = {
                        IconButton(onClick = onNavigateToSetupCheck) {
                            Icon(Icons.Default.Warning, contentDescription = "Setup check")
                        }
                        IconButton(onClick = { showNameDialog = true }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit device name")
                        }
                        if (currentUser?.role == UserRole.OWNER || currentUser?.role == UserRole.ADMIN) {
                            IconButton(onClick = onNavigateToAdmin) {
                                Icon(Icons.Default.Settings, contentDescription = "Admin")
                            }
                        }
                    }
                )
                StatusBar(
                    connectionState = connectionState,
                    serverHealthStatus = serverHealthStatus
                )
            }
        }
    ) { paddingValues ->
        if (showNameDialog) {
            AlertDialog(
                onDismissRequest = { showNameDialog = false },
                title = { Text("Device name") },
                text = {
                    OutlinedTextField(
                        value = deviceNameInput,
                        onValueChange = { deviceNameInput = it.take(24) },
                        singleLine = true,
                        label = { Text("Name shown to other phones") }
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            viewModel.saveDeviceName(deviceNameInput)
                            showNameDialog = false
                            context.startService(Intent(context, TalkForegroundService::class.java).apply {
                                action = Constants.ACTION_REFRESH_IDENTITY
                            })
                        },
                        enabled = deviceNameInput.isNotBlank()
                    ) {
                        Text("Save")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showNameDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(MaterialTheme.colorScheme.background),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Channel Banner
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Group, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = currentChannel?.name ?: stringResource(R.string.common_channel),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            if (channels.size > 1) {
                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(channels) { channel ->
                        val selected = channel.id == currentChannel?.id
                        Button(
                            onClick = { viewModel.selectChannel(channel) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (selected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                },
                                contentColor = if (selected) {
                                    MaterialTheme.colorScheme.onPrimary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                }
                            )
                        ) {
                            Text(channel.name)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            // Now Talking Indicator
            AnimatedVisibility(visible = floorState is FloorState.Granted && currentSpeaker != null) {
                if (currentSpeaker != null) {
                    val isSelf = currentSpeaker!!.speakerUserId == currentUser?.id
                    
                    val infiniteTransition = rememberInfiniteTransition(label = "border_pulse")
                    val borderColor by infiniteTransition.animateFloat(
                        initialValue = 0.3f,
                        targetValue = 1f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(800, easing = FastOutSlowInEasing),
                            repeatMode = RepeatMode.Reverse
                        ),
                        label = "border_alpha"
                    )

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                            .border(
                                width = 2.dp,
                                color = MaterialTheme.colorScheme.primary.copy(alpha = borderColor),
                                shape = RoundedCornerShape(12.dp)
                            ),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Avatar
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .background(MaterialTheme.colorScheme.primary, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    currentSpeaker!!.speakerName.first().toString().uppercase(),
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            
                            Spacer(modifier = Modifier.width(16.dp))
                            
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = if (isSelf) "You are talking" else currentSpeaker!!.speakerName,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                RoleBadge(role = currentSpeaker!!.speakerRole)
                            }
                            
                            // Timer
                            if (isSelf) {
                                Text(
                                    text = "${talkDuration}s",
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 18.sp
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Online Users Row
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Online (${onlineUsers.size})",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    TextButton(onClick = onNavigateToUserList) {
                        Text("View All")
                    }
                }
                
                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(onlineUsers) { user ->
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(
                                modifier = Modifier
                                    .size(56.dp)
                                    .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    user.displayName.firstOrNull()?.toString()?.uppercase() ?: "U",
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Box(
                                    modifier = Modifier
                                        .size(12.dp)
                                        .align(Alignment.BottomEnd)
                                        .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                                        .padding(2.dp)
                                        .background(OnlineGreen, CircleShape)
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = user.displayName.split(" ").first(),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Quick Actions
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Button(
                    onClick = onNavigateToPrivateTalk,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                ) {
                    Icon(Icons.Default.Call, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.private_talk))
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // BIG PTT BUTTON
            TalkButton(
                floorState = floorState,
                remainingSeconds = talkDuration,
                onPressStart = {
                    android.util.Log.d("HomeScreen", "onPressStart triggered")
                    if (CallStateHelper.isPhoneCallActive(context)) {
                        android.widget.Toast.makeText(context, "Phone call is active", android.widget.Toast.LENGTH_SHORT).show()
                        return@TalkButton
                    }
                    if (com.factorytalk.app.util.PermissionHelper.hasRecordAudioPermission(context)) {
                        android.util.Log.d("HomeScreen", "Has permission, starting service for ACTION_START_TALKING")
                        val intent = Intent(context, TalkForegroundService::class.java).apply {
                            action = Constants.ACTION_START_TALKING
                        }
                        context.startService(intent)
            } else {
                android.util.Log.d("HomeScreen", "Missing permission!")
                permissionLauncher.launch(requiredPermissions)
                android.widget.Toast.makeText(context, "Microphone permission required", android.widget.Toast.LENGTH_SHORT).show()
            }
        },
                onPressEnd = {
                    android.util.Log.d("HomeScreen", "onPressEnd triggered")
                    val intent = Intent(context, TalkForegroundService::class.java).apply {
                        action = Constants.ACTION_STOP_TALKING
                    }
                    context.startService(intent)
                }
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Emergency Button for Owner/Admin
            if (currentUser?.role == UserRole.OWNER || currentUser?.role == UserRole.ADMIN) {
                EmergencyButton(
                    onEmergencyConfirm = { viewModel.sendEmergencyBroadcast() },
                    modifier = Modifier.padding(bottom = 16.dp)
                )
            }
        }
    }
}
