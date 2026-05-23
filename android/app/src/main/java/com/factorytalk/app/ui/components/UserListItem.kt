package com.factorytalk.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.factorytalk.app.data.model.User
import com.factorytalk.app.data.model.UserRole
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun UserListItem(
    user: User,
    onPrivateTalkClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Avatar
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(48.dp)
                    .background(
                        color = getRoleColor(user.role).copy(alpha = 0.2f),
                        shape = CircleShape
                    )
            ) {
                val initial = if (user.displayName.isNotBlank()) {
                    user.displayName.first().toString().uppercase()
                } else {
                    "U"
                }
                Text(
                    text = initial,
                    style = MaterialTheme.typography.titleMedium,
                    color = getRoleColor(user.role),
                    fontWeight = FontWeight.Bold
                )
                
                // Online Indicator
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .align(Alignment.BottomEnd)
                        .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                        .padding(2.dp)
                        .background(
                            if (user.isOnline) Color(0xFF00E676) else Color.Gray,
                            CircleShape
                        )
                )
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            // Info
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = if (user.displayName.isNotBlank()) user.displayName else user.phoneNumber,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    RoleBadge(role = user.role)
                }
                
                Text(
                    text = if (user.isOnline) "Online" else "Last seen: ${formatTime(user.lastSeen)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            // Action
            if (user.isOnline) {
                IconButton(
                    onClick = onPrivateTalkClick,
                    modifier = Modifier
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f), CircleShape)
                ) {
                    Icon(
                        imageVector = Icons.Default.Call,
                        contentDescription = "Private Talk",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

@Composable
fun RoleBadge(role: UserRole) {
    val (color, text) = when (role) {
        UserRole.OWNER -> Pair(Color(0xFFFFD700), "OWNER")
        UserRole.ADMIN -> Pair(Color(0xFF2196F3), "ADMIN")
        UserRole.SUPERVISOR -> Pair(Color(0xFF9C27B0), "SUPERVISOR")
        UserRole.WORKER -> Pair(Color(0xFF9E9E9E), "WORKER")
    }
    
    Box(
        modifier = Modifier
            .background(color.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = text,
            color = color,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

fun getRoleColor(role: UserRole): Color {
    return when (role) {
        UserRole.OWNER -> Color(0xFFFFD700)
        UserRole.ADMIN -> Color(0xFF2196F3)
        UserRole.SUPERVISOR -> Color(0xFF9C27B0)
        UserRole.WORKER -> Color(0xFF9E9E9E)
    }
}

private fun formatTime(timeMs: Long): String {
    if (timeMs == 0L) return "Never"
    val sdf = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
    return sdf.format(Date(timeMs))
}
