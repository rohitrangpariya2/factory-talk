package com.factorytalk.app.ui.screens

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.factorytalk.app.util.BatteryOptimizationHelper
import com.factorytalk.app.util.PermissionHelper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupGuideScreen(
    onSetupComplete: () -> Unit
) {
    val context = LocalContext.current
    var hasRequiredPermissions by remember { mutableStateOf(false) }
    var isIgnoringBattery by remember { mutableStateOf(false) }

    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current

    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                val missing = PermissionHelper.getMissingPermissions(context)
                hasRequiredPermissions = missing.isEmpty()
                isIgnoringBattery = BatteryOptimizationHelper.isIgnoringBatteryOptimizations(context)
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
                title = { Text("Required Setup") },
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
                    text = "To ensure you receive all Walkie Talkie broadcasts even when the app is closed, you must configure the following settings:",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Spacer(modifier = Modifier.height(24.dp))
            }

            item {
                SetupStepItem(
                    title = "1. App Permissions",
                    description = "Allow microphone, notifications, and background operation.",
                    isCompleted = hasRequiredPermissions,
                    actionText = "Grant Permissions",
                    onAction = {
                        val missing = PermissionHelper.getMissingPermissions(context)
                        if (missing.isNotEmpty()) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                var currentContext = context
                                while (currentContext is android.content.ContextWrapper) {
                                    if (currentContext is Activity) {
                                        break
                                    }
                                    currentContext = currentContext.baseContext
                                }
                                val activity = currentContext as? Activity
                                activity?.let {
                                    androidx.core.app.ActivityCompat.requestPermissions(it, missing.toTypedArray(), 100)
                                }
                            }
                        }
                    }
                )
            }

            item {
                SetupStepItem(
                    title = "2. Battery Optimization",
                    description = "Allow the app to run in the background without being killed by Android.",
                    isCompleted = isIgnoringBattery,
                    actionText = "Disable Optimization",
                    onAction = {
                        BatteryOptimizationHelper.requestIgnoreBatteryOptimizations(context)
                    }
                )
            }

            item {
                SetupStepItem(
                    title = "3. Device Specific Setup: ${manufacturerGuide.manufacturer}",
                    description = "Some manufacturers require extra steps to allow background apps.\n\n" +
                                manufacturerGuide.steps.joinToString("\n") { "• $it" },
                    isCompleted = false, // We can't automatically verify OEM settings usually
                    actionText = "Open Device Settings",
                    onAction = {
                        BatteryOptimizationHelper.openAutoStartSettings(context)
                    }
                )
            }

            item {
                Spacer(modifier = Modifier.height(32.dp))
                Button(
                    onClick = onSetupComplete,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    enabled = hasRequiredPermissions 
                ) {
                    Text("Complete Setup")
                }
            }
        }
    }
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
                
                if (isCompleted) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = "Completed",
                        tint = Color(0xFF00E676)
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = "Needs Action",
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            if (!isCompleted) {
                Button(onClick = onAction) {
                    Text(actionText)
                }
            }
        }
    }
}
