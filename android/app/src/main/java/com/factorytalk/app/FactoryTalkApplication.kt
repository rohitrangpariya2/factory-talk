package com.factorytalk.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class FactoryTalkApplication : Application() {
    override fun onCreate() {
        super.onCreate()
    }
}
