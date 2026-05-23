package com.factorytalk.app.di

import android.content.Context
import com.factorytalk.app.audio.AudioRouteManager
import com.factorytalk.app.audio.FloorControlManager
import com.factorytalk.app.audio.RelayAudioManager
import com.factorytalk.app.audio.WebRTCManager
import com.factorytalk.app.data.remote.SignalingClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AudioModule {

    @Provides
    @Singleton
    fun provideWebRTCManager(@ApplicationContext context: Context): WebRTCManager {
        return WebRTCManager(context)
    }

    @Provides
    @Singleton
    fun provideAudioRouteManager(@ApplicationContext context: Context): AudioRouteManager {
        return AudioRouteManager(context)
    }

    @Provides
    @Singleton
    fun provideRelayAudioManager(
        @ApplicationContext context: Context,
        signalingClient: SignalingClient
    ): RelayAudioManager {
        return RelayAudioManager(context, signalingClient)
    }

    @Provides
    @Singleton
    fun provideFloorControlManager(
        signalingClient: SignalingClient,
        webRTCManager: WebRTCManager
    ): FloorControlManager {
        return FloorControlManager(signalingClient, webRTCManager)
    }
}
