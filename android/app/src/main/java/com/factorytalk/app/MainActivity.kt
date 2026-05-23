package com.factorytalk.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.factorytalk.app.ui.navigation.Screen
import com.factorytalk.app.ui.screens.AdminScreen
import com.factorytalk.app.ui.screens.HomeScreen
import com.factorytalk.app.ui.screens.LoginScreen
import com.factorytalk.app.ui.screens.PrivateTalkScreen
import com.factorytalk.app.ui.screens.SetupGuideScreen
import com.factorytalk.app.ui.screens.UserListScreen
import com.factorytalk.app.ui.theme.FactoryTalkTheme
import com.factorytalk.app.util.Constants
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var auth: FirebaseAuth

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FactoryTalkTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val startDestination = if (Constants.DEMO_MODE || auth.currentUser != null) {
                        Screen.Home.route
                    } else {
                        Screen.Login.route
                    }
                    FactoryTalkApp(startDestination = startDestination)
                }
            }
        }
    }
}

@Composable
fun FactoryTalkApp(startDestination: String) {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Screen.Login.route) {
            LoginScreen(
                onNavigateToHome = {
                    navController.navigate(Screen.SetupGuide.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }
        
        composable(Screen.SetupGuide.route) {
            SetupGuideScreen(
                onSetupComplete = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.SetupGuide.route) { inclusive = true }
                    }
                }
            )
        }
        
        composable(Screen.Home.route) {
            HomeScreen(
                onNavigateToPrivateTalk = { navController.navigate(Screen.PrivateTalk.route) },
                onNavigateToAdmin = { navController.navigate(Screen.Admin.route) },
                onNavigateToUserList = { navController.navigate(Screen.UserList.route) }
            )
        }
        
        composable(Screen.PrivateTalk.route) {
            PrivateTalkScreen()
        }
        
        composable(Screen.Admin.route) {
            AdminScreen()
        }
        
        composable(Screen.UserList.route) {
            UserListScreen()
        }
    }
}
