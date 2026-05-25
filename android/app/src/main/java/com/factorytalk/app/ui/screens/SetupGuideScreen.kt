package com.factorytalk.app.ui.screens

import android.app.Activity
import android.content.Intent
import android.provider.Settings
import android.os.Build
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewModelScope
import com.factorytalk.app.data.model.ConnectionState
import com.factorytalk.app.data.model.ServerHealthStatus
import com.factorytalk.app.data.remote.ServerHealthMonitor
import com.factorytalk.app.data.remote.SignalingClient
import com.factorytalk.app.service.TalkForegroundService
import com.factorytalk.app.util.BatteryOptimizationHelper
import com.factorytalk.app.util.Constants
import com.factorytalk.app.util.PermissionHelper
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class SetupCheckViewModel @Inject constructor(
    signalingClient: SignalingClient,
    serverHealthMonitor: ServerHealthMonitor
) : ViewModel() {
    val connectionState = signalingClient.connectionState
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ConnectionState.DISCONNECTED)

    val serverHealthStatus = serverHealthMonitor.status
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ServerHealthStatus.UNKNOWN)

    init {
        serverHealthMonitor.start(Constants.SERVER_URL)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupGuideScreen(
    onSetupComplete: () -> Unit,
    viewModel: SetupCheckViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    var hasRequiredPermissions by remember { mutableStateOf(false) }
    var isIgnoringBattery by remember { mutableStateOf(false) }
    var allowAudioDuringCall by remember { mutableStateOf(false) }
    var locationSharingEnabled by remember { mutableStateOf(false) }
    var lastLocationSentAt by remember { mutableStateOf(0L) }
    var locationStatus by remember { mutableStateOf("") }
    val connectionState by viewModel.connectionState.collectAsState()
    val serverHealthStatus by viewModel.serverHealthStatus.collectAsState()

    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                hasRequiredPermissions = PermissionHelper.getMissingPermissions(context).isEmpty()
                isIgnoringBattery = BatteryOptimizationHelper.isIgnoringBatteryOptimizations(context)
                allowAudioDuringCall = context
                    .getSharedPreferences(Constants.PREFS_NAME, android.content.Context.MODE_PRIVATE)
                    .getBoolean(Constants.PREF_ALLOW_AUDIO_DURING_CALL, false)
                locationSharingEnabled = context
                    .getSharedPreferences(Constants.PREFS_NAME, android.content.Context.MODE_PRIVATE)
                    .getBoolean(Constants.PREF_LOCATION_SHARING_ENABLED, false)
                lastLocationSentAt = context
                    .getSharedPreferences(Constants.PREFS_NAME, android.content.Context.MODE_PRIVATE)
                    .getLong(Constants.PREF_LAST_LOCATION_SENT_AT, 0L)
                locationStatus = context
                    .getSharedPreferences(Constants.PREFS_NAME, android.content.Context.MODE_PRIVATE)
                    .getString(Constants.PREF_LOCATION_STATUS, "") ?: ""
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    val manufacturerGuide = BatteryOptimizationHelper.getManufacturerGuide()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Setup Check") },
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
                .padding(16.dp)
        ) {
            item {
                Text(
                    text = "Keep every phone green here so Factory Talk can receive even when the app is minimized. Phone: ${manufacturerGuide.manufacturer} ${manufacturerGuide.model}",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            item {
                SetupStepItem(
                    title = "Server",
                    description = when (serverHealthStatus) {
                        ServerHealthStatus.AWAKE -> "Server is awake."
                        ServerHealthStatus.CHECKING -> "Checking or waking server."
                        ServerHealthStatus.OFFLINE -> "Server is sleeping/offline. Wait and retry."
                        ServerHealthStatus.UNKNOWN -> "Waiting for server check."
                    },
                    isCompleted = serverHealthStatus == ServerHealthStatus.AWAKE,
                    actionText = "Wait",
                    onAction = {}
                )
            }

            item {
                SetupStepItem(
                    title = "This Phone Connection",
                    description = when (connectionState) {
                        ConnectionState.CONNECTED -> "This phone is online and ready."
                        ConnectionState.CONNECTING -> "Connecting to server."
                        ConnectionState.RECONNECTING -> "Reconnecting. Check internet if this stays orange."
                        ConnectionState.DISCONNECTED -> "Offline. Open app, allow permissions, and check battery setting."
                    },
                    isCompleted = connectionState == ConnectionState.CONNECTED,
                    actionText = "Open App",
                    onAction = {}
                )
            }

            item {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Call time audio", fontWeight = FontWeight.Bold)
                            Text(
                                text = if (allowAudioDuringCall) {
                                    "Phone call chalu hoy to pan Factory Talk audio allow."
                                } else {
                                    "Phone call chalu hoy tyare Factory Talk audio block."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = allowAudioDuringCall,
                            onCheckedChange = { checked ->
                                allowAudioDuringCall = checked
                                context.getSharedPreferences(Constants.PREFS_NAME, android.content.Context.MODE_PRIVATE)
                                    .edit()
                                    .putBoolean(Constants.PREF_ALLOW_AUDIO_DURING_CALL, checked)
                                    .apply()
                            }
                        )
                    }
                }
            }

            item {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Duty location sharing", fontWeight = FontWeight.Bold)
                            Text(
                                text = if (locationSharingEnabled) {
                                    if (lastLocationSentAt > 0L) {
                                        "Last location sent: ${formatSetupTime(lastLocationSentAt)}"
                                    } else {
                                        val status = locationStatus.ifBlank { "Waiting for GPS/location fix" }
                                        "$status. Phone Location/GPS ON karo, Location permission allow karo ane app 30 sec khulli rakho."
                                    }
                                } else {
                                    "OFF hoy tyare admin ne aa phone nu location moklavama nahi ave."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = locationSharingEnabled,
                            onCheckedChange = { checked ->
                                locationSharingEnabled = checked
                                context.getSharedPreferences(Constants.PREFS_NAME, android.content.Context.MODE_PRIVATE)
                                    .edit()
                                    .putBoolean(Constants.PREF_LOCATION_SHARING_ENABLED, checked)
                                    .apply()

                                if (checked && !PermissionHelper.hasLocationPermission(context) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                    var currentContext = context
                                    while (currentContext is android.content.ContextWrapper) {
                                        if (currentContext is Activity) break
                                        currentContext = currentContext.baseContext
                                    }
                                    (currentContext as? Activity)?.let {
                                        androidx.core.app.ActivityCompat.requestPermissions(
                                            it,
                                            arrayOf(
                                                android.Manifest.permission.ACCESS_FINE_LOCATION,
                                                android.Manifest.permission.ACCESS_COARSE_LOCATION
                                            ),
                                            101
                                        )
                                    }
                                }

                                val serviceIntent = Intent(context, TalkForegroundService::class.java).apply {
                                    action = Constants.ACTION_START_SERVICE
                                }
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                    context.startForegroundService(serviceIntent)
                                } else {
                                    context.startService(serviceIntent)
                                }
                            }
                        )
                    }
                }
            }

            item {
                if (locationSharingEnabled && lastLocationSentAt == 0L) {
                    Button(
                        onClick = {
                            context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Open Phone Location Settings")
                    }
                }
            }

            item {
                SetupStepItem(
                    title = "App Permissions",
                    description = "Allow Microphone, Notifications, Nearby devices/Bluetooth, and network access.",
                    isCompleted = hasRequiredPermissions,
                    actionText = "Open App Settings",
                    onAction = {
                        val missing = PermissionHelper.getMissingPermissions(context)
                        if (missing.isNotEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            var currentContext = context
                            while (currentContext is android.content.ContextWrapper) {
                                if (currentContext is Activity) break
                                currentContext = currentContext.baseContext
                            }
                            (currentContext as? Activity)?.let {
                                androidx.core.app.ActivityCompat.requestPermissions(it, missing.toTypedArray(), 100)
                            } ?: BatteryOptimizationHelper.openAppSettings(context)
                        } else {
                            BatteryOptimizationHelper.openAppSettings(context)
                        }
                    }
                )
            }

            item {
                SetupStepItem(
                    title = "Battery Optimization",
                    description = "Set Factory Talk to Unrestricted or Don't optimize.",
                    isCompleted = isIgnoringBattery,
                    actionText = "Disable Optimization",
                    onAction = {
                        BatteryOptimizationHelper.requestIgnoreBatteryOptimizations(context)
                    }
                )
            }

            item {
                SetupStepItem(
                    title = "Company guide: ${manufacturerGuide.manufacturer} ${manufacturerGuide.model}",
                    description = manufacturerGuide.steps.joinToString("\n\n") { "- $it" },
                    isCompleted = false,
                    actionText = "Open Device Settings",
                    onAction = {
                        BatteryOptimizationHelper.openAutoStartSettings(context)
                    }
                )
            }

            item {
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onSetupComplete,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    enabled = hasRequiredPermissions
                ) {
                    Text("Done")
                }
            }
        }
    }
}

private fun formatSetupTime(timestamp: Long): String {
    return SimpleDateFormat("hh:mm:ss a", Locale.getDefault()).format(Date(timestamp))
}

@Composable
fun SetupStepItem(
    title: String,
    description: String,
    isCompleted: Boolean,
    actionText: String,
    onAction: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )

                Icon(
                    imageVector = if (isCompleted) Icons.Default.CheckCircle else Icons.Default.Warning,
                    contentDescription = if (isCompleted) "Ready" else "Needs action",
                    tint = if (isCompleted) Color(0xFF00C853) else MaterialTheme.colorScheme.error
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (!isCompleted) {
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = onAction) {
                    Text(actionText)
                }
            }
        }
    }
}
