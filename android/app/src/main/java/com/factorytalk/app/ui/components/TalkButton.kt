package com.factorytalk.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.factorytalk.app.data.model.FloorState

@Composable
fun TalkButton(
    floorState: FloorState,
    remainingSeconds: Int,
    onPressStart: () -> Unit,
    onPressEnd: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isTalking = floorState is FloorState.Granted && floorState.isSelf
    val isDenied = floorState is FloorState.Denied
    val isBusy = floorState is FloorState.Granted && !floorState.isSelf

    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (isTalking) 1.15f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_scale"
    )

    val (buttonColor, icon, mainText, subText) = when {
        isTalking -> listOf(
            MaterialTheme.colorScheme.primary,
            Icons.Default.Mic,
            "TALKING",
            "${remainingSeconds}s remaining"
        )
        isDenied -> listOf(
            MaterialTheme.colorScheme.error,
            Icons.Default.MicOff,
            "DENIED",
            "Channel Busy"
        )
        isBusy -> listOf(
            MaterialTheme.colorScheme.surfaceVariant,
            Icons.Default.MicOff,
            "BUSY",
            "Someone is talking"
        )
        else -> listOf(
            MaterialTheme.colorScheme.primary,
            Icons.Default.Mic,
            "HOLD TO TALK",
            "બોલવા દબાવો"
        )
    }

    val gradientBrush = Brush.radialGradient(
        colors = listOf(
            (buttonColor as Color).copy(alpha = 0.8f),
            buttonColor
        )
    )

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.size(300.dp)
    ) {
        // Outer pulsing ring
        if (isTalking) {
            Box(
                modifier = Modifier
                    .size(280.dp)
                    .scale(scale)
                    .background(buttonColor.copy(alpha = 0.2f), CircleShape)
            )
            Box(
                modifier = Modifier
                    .size(260.dp)
                    .scale(scale * 0.95f)
                    .background(buttonColor.copy(alpha = 0.3f), CircleShape)
            )
        }

        // Main button
        Surface(
            shape = CircleShape,
            color = Color.Transparent,
            modifier = Modifier
                .size(220.dp)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onPress = {
                            android.util.Log.d("TalkButton", "Button pressed!")
                            if (!isBusy) {
                                android.util.Log.d("TalkButton", "Calling onPressStart")
                                onPressStart()
                                tryAwaitRelease()
                                android.util.Log.d("TalkButton", "Button released, calling onPressEnd")
                                onPressEnd()
                            } else {
                                android.util.Log.d("TalkButton", "Button is busy")
                            }
                        }
                    )
                }
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .background(brush = gradientBrush)
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(16.dp)
                ) {
                    Icon(
                        imageVector = icon as androidx.compose.ui.graphics.vector.ImageVector,
                        contentDescription = "Mic",
                        tint = Color.White,
                        modifier = Modifier.size(48.dp)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = mainText as String,
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = subText as String,
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}
