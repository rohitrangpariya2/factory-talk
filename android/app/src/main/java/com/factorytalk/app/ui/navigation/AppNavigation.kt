package com.factorytalk.app.ui.navigation

import android.net.Uri

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Home : Screen("home")
    object PrivateTalk : Screen("private_talk") {
        const val ROUTE = "private_talk?targetUserId={targetUserId}"
        fun createRoute(targetUserId: String): String {
            return "private_talk?targetUserId=${Uri.encode(targetUserId)}"
        }
    }
    object UserList : Screen("user_list")
    object Admin : Screen("admin")
    object SetupGuide : Screen("setup_guide")
    object SetupCheck : Screen("setup_check")
    
    data class Channel(val channelId: String) : Screen("channel/$channelId") {
        companion object {
            const val ROUTE = "channel/{channelId}"
        }
    }
}
