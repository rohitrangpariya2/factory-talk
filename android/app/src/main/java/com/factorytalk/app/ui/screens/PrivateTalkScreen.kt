package com.factorytalk.app.ui.screens

import android.content.Intent
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import com.factorytalk.app.data.model.FloorState
import com.factorytalk.app.service.TalkForegroundService
import com.factorytalk.app.ui.components.TalkButton
import com.factorytalk.app.util.CallStateHelper
import com.factorytalk.app.util.Constants

@Composable
fun PrivateTalkScreen(
    viewModel: HomeViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val currentUser by viewModel.currentUser.collectAsState()
    val currentChannel by viewModel.currentChannel.collectAsState()
    val onlineUsers by viewModel.onlineUsers.collectAsState()
    val floorState by viewModel.floorState.collectAsState()
    val talkDuration by viewModel.talkDurationSeconds.collectAsState()
    var selectedUserId by remember { mutableStateOf<String?>(null) }
    val walkieEnabled = remember {
        context.getSharedPreferences(Constants.PREFS_NAME, android.content.Context.MODE_PRIVATE)
            .getBoolean(Constants.PREF_WALKIE_ENABLED, true)
    }

    val privateTargets = onlineUsers.filter { it.id != currentUser?.id }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Private Talk",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "Select one phone, then hold to talk.",
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(modifier = Modifier.height(16.dp))

        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(privateTargets) { user ->
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { selectedUserId = user.id },
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.medium
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = selectedUserId == user.id,
                            onClick = { selectedUserId = user.id }
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(user.displayName, fontWeight = FontWeight.Bold)
                            Text(
                                text = if (user.isBusy) "BUSY - Phone call active" else user.role.name,
                                style = MaterialTheme.typography.labelMedium,
                                color = if (user.isBusy) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        TalkButton(
            floorState = if (selectedUserId == null) FloorState.Denied("Select user") else floorState,
            remainingSeconds = talkDuration,
            onPressStart = {
                if (!walkieEnabled) {
                    android.widget.Toast.makeText(context, "Walkie Talkie is OFF", android.widget.Toast.LENGTH_SHORT).show()
                    return@TalkButton
                }
                if (CallStateHelper.shouldBlockAppAudio(context)) {
                    android.widget.Toast.makeText(context, "Phone call is active", android.widget.Toast.LENGTH_SHORT).show()
                    return@TalkButton
                }
                val channelId = currentChannel?.id ?: Constants.DEMO_CHANNEL_ID
                val targetId = selectedUserId ?: return@TalkButton
                context.startService(Intent(context, TalkForegroundService::class.java).apply {
                    action = Constants.ACTION_START_TALKING
                    putExtra(Constants.EXTRA_CHANNEL_ID, channelId)
                    putExtra(Constants.EXTRA_TARGET_USER_ID, targetId)
                })
            },
            onPressEnd = {
                context.startService(Intent(context, TalkForegroundService::class.java).apply {
                    action = Constants.ACTION_STOP_TALKING
                })
            }
        )
    }
}
