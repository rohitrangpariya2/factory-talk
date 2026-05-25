package com.factorytalk.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.factorytalk.app.data.model.ConnectionState
import com.factorytalk.app.data.model.ServerHealthStatus

@Composable
fun StatusBar(
    connectionState: ConnectionState,
    serverHealthStatus: ServerHealthStatus = ServerHealthStatus.UNKNOWN,
    modifier: Modifier = Modifier
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val (icon, color, text) = when {
                connectionState == ConnectionState.CONNECTED ->
                    Triple(Icons.Default.Wifi, Color(0xFF00E676), "Connected")
                serverHealthStatus == ServerHealthStatus.CHECKING ->
                    Triple(Icons.Default.Wifi, Color(0xFFFF9800), "Connecting... waking server")
                serverHealthStatus == ServerHealthStatus.OFFLINE ->
                    Triple(Icons.Default.Warning, Color(0xFFFF9800), "Server sleeping/offline")
                connectionState == ConnectionState.CONNECTING ->
                    Triple(Icons.Default.Wifi, Color(0xFFFF9800), "Connecting...")
                connectionState == ConnectionState.RECONNECTING ->
                    Triple(Icons.Default.Warning, Color(0xFFFF9800), "Reconnecting...")
                else ->
                    Triple(Icons.Default.WifiOff, Color.Red, "Offline")
            }

            Box(
                modifier = Modifier
                    .size(12.dp)
                    .background(color, CircleShape)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                color = color,
                fontWeight = FontWeight.Medium
            )
            
            Spacer(modifier = Modifier.weight(1f))
            
            Text(
                text = "Factory Talk",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold
            )
        }
    }
}
