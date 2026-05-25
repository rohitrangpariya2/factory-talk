package com.factorytalk.app.ui.navigation

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Home : Screen("home")
    object PrivateTalk : Screen("private_talk")
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
