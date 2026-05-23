package com.factorytalk.app.util

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

object BatteryOptimizationHelper {

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pm.isIgnoringBatteryOptimizations(context.packageName)
        } else {
            true
        }
    }

    fun requestIgnoreBatteryOptimizations(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            context.startActivity(intent)
        }
    }

    fun openAutoStartSettings(context: Context) {
        val manufacturer = Build.MANUFACTURER.lowercase()
        
        val intent = when {
            manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> Intent().apply {
                component = ComponentName(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity"
                )
            }
            manufacturer.contains("oppo") -> Intent().apply {
                component = ComponentName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                )
            }
            manufacturer.contains("vivo") -> Intent().apply {
                component = ComponentName(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                )
            }
            manufacturer.contains("realme") -> Intent().apply {
                component = ComponentName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.startupapp.StartupAppListActivity"
                )
            }
            manufacturer.contains("samsung") -> Intent().apply {
                component = ComponentName(
                    "com.samsung.android.sm_cn",
                    "com.samsung.android.sm.ui.battery.BatteryActivity"
                )
            }
            else -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        }
        
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            // Fallback to standard app info settings
            val fallbackIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            context.startActivity(fallbackIntent)
        }
    }

    fun getManufacturerGuide(): BatteryGuide {
        val manufacturer = Build.MANUFACTURER.lowercase()
        return when {
            manufacturer.contains("xiaomi") || manufacturer.contains("redmi") -> BatteryGuide(
                manufacturer = "Xiaomi/Redmi",
                steps = listOf(
                    "Enable 'Autostart' for Factory Talk",
                    "Set Battery Saver to 'No restrictions'"
                )
            )
            manufacturer.contains("vivo") -> BatteryGuide(
                manufacturer = "Vivo",
                steps = listOf(
                    "Enable 'Autostart' in permissions",
                    "Set Background Power Consumption to 'High background power consumption'"
                )
            )
            manufacturer.contains("oppo") || manufacturer.contains("realme") -> BatteryGuide(
                manufacturer = "Oppo/Realme",
                steps = listOf(
                    "Allow Auto-launch",
                    "Allow Background activity"
                )
            )
            manufacturer.contains("samsung") -> BatteryGuide(
                manufacturer = "Samsung",
                steps = listOf(
                    "Remove app from 'Sleeping apps'",
                    "Allow background activity"
                )
            )
            else -> BatteryGuide(
                manufacturer = Build.MANUFACTURER.replaceFirstChar { it.uppercase() },
                steps = listOf(
                    "Disable battery optimization",
                    "Allow background activity"
                )
            )
        }
    }
}

data class BatteryGuide(
    val manufacturer: String,
    val steps: List<String>
)

data class SetupItem(
    val id: String,
    val title: String,
    val description: String,
    val isCompleted: Boolean,
    val actionText: String
)
