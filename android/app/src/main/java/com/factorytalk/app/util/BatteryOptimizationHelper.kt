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

    fun openAppSettings(context: Context) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
        context.startActivity(intent)
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
        val model = Build.MODEL
        return when {
            manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> BatteryGuide(
                manufacturer = "Xiaomi/Redmi/Poco",
                model = model,
                steps = listOf(
                    "Settings > Apps > Manage apps > Factory Talk > Permissions: allow Microphone, Notifications, Nearby devices/Bluetooth.",
                    "Settings > Apps > Manage apps > Factory Talk > Battery saver: select No restrictions.",
                    "Security app > Permissions > Autostart: enable Factory Talk.",
                    "Recent apps screen: long press Factory Talk and lock it if your phone supports app lock."
                )
            )
            manufacturer.contains("vivo") -> BatteryGuide(
                manufacturer = "Vivo",
                model = model,
                steps = listOf(
                    "Settings > Apps > Factory Talk > Permissions: allow Microphone, Notifications, Nearby devices/Bluetooth.",
                    "Settings > Battery > Background power consumption management: allow Factory Talk.",
                    "iManager > App manager > Autostart: enable Factory Talk.",
                    "Do not put Factory Talk in sleep/freeze list."
                )
            )
            manufacturer.contains("oppo") || manufacturer.contains("realme") -> BatteryGuide(
                manufacturer = "Oppo/Realme",
                model = model,
                steps = listOf(
                    "Settings > Apps > Factory Talk > Permissions: allow Microphone, Notifications, Nearby devices/Bluetooth.",
                    "Settings > Battery > App battery management > Factory Talk: allow background activity.",
                    "Phone Manager/Security > Startup manager: allow Auto launch for Factory Talk.",
                    "Recent apps screen: lock Factory Talk if option is available."
                )
            )
            manufacturer.contains("samsung") -> BatteryGuide(
                manufacturer = "Samsung",
                model = model,
                steps = listOf(
                    "Settings > Apps > Factory Talk > Permissions: allow Microphone, Notifications, Nearby devices/Bluetooth.",
                    "Settings > Apps > Factory Talk > Battery: select Unrestricted.",
                    "Settings > Battery > Background usage limits: remove Factory Talk from Sleeping apps and Deep sleeping apps.",
                    "Settings > Notifications > App notifications > Factory Talk: allow notifications."
                )
            )
            manufacturer.contains("oneplus") -> BatteryGuide(
                manufacturer = "OnePlus",
                model = model,
                steps = listOf(
                    "Settings > Apps > Factory Talk > Permissions: allow Microphone, Notifications, Nearby devices/Bluetooth.",
                    "Settings > Battery > Battery optimization > Factory Talk: select Don't optimize.",
                    "Settings > Apps > Auto launch/App battery usage: allow background activity.",
                    "Recent apps screen: lock Factory Talk if option is available."
                )
            )
            manufacturer.contains("motorola") || manufacturer.contains("moto") -> BatteryGuide(
                manufacturer = "Motorola",
                model = model,
                steps = listOf(
                    "Settings > Apps > Factory Talk > Permissions: allow Microphone, Notifications, Nearby devices/Bluetooth.",
                    "Settings > Battery > Battery optimization > Factory Talk: select Not optimized.",
                    "Settings > Apps > Factory Talk > Battery: allow background usage.",
                    "Keep Battery Saver off during factory walkie-talkie use."
                )
            )
            manufacturer.contains("infinix") || manufacturer.contains("tecno") || manufacturer.contains("itel") -> BatteryGuide(
                manufacturer = "Infinix/Tecno/iTel",
                model = model,
                steps = listOf(
                    "Settings > Apps > Factory Talk > Permissions: allow Microphone, Notifications, Nearby devices/Bluetooth.",
                    "Phone Master/Power Marathon > Auto-start management: enable Factory Talk.",
                    "Battery settings > App power management: set Factory Talk to No restriction.",
                    "Recent apps screen: lock Factory Talk if option is available."
                )
            )
            else -> BatteryGuide(
                manufacturer = Build.MANUFACTURER.replaceFirstChar { it.uppercase() },
                model = model,
                steps = listOf(
                    "Settings > Apps > Factory Talk > Permissions: allow Microphone, Notifications, Nearby devices/Bluetooth.",
                    "Settings > Battery > Battery optimization: set Factory Talk to Don't optimize or Unrestricted.",
                    "Settings > Notifications > Factory Talk: allow notifications.",
                    "If your phone has Autostart/Background activity setting, allow Factory Talk."
                )
            )
        }
    }
}

data class BatteryGuide(
    val manufacturer: String,
    val model: String,
    val steps: List<String>
)

data class SetupItem(
    val id: String,
    val title: String,
    val description: String,
    val isCompleted: Boolean,
    val actionText: String
)
