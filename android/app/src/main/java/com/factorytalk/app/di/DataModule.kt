package com.factorytalk.app.di

import android.content.Context
import android.content.SharedPreferences
import com.factorytalk.app.data.demo.DeviceIdentityProvider
import com.factorytalk.app.data.remote.FirestoreDataSource
import com.factorytalk.app.data.remote.SignalingClient
import com.factorytalk.app.data.repository.AuthRepository
import com.factorytalk.app.data.repository.AuthRepositoryImpl
import com.factorytalk.app.data.repository.ChannelRepository
import com.factorytalk.app.data.repository.ChannelRepositoryImpl
import com.factorytalk.app.data.repository.UserRepository
import com.factorytalk.app.data.repository.UserRepositoryImpl
import com.factorytalk.app.util.Constants
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DataModule {

    @Provides
    @Singleton
    fun provideSharedPreferences(@ApplicationContext context: Context): SharedPreferences {
        return context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
    }

    @Provides
    @Singleton
    fun provideSignalingClient(@ApplicationContext context: Context): SignalingClient {
        return SignalingClient(context)
    }

    @Provides
    @Singleton
    fun provideFirestoreDataSource(firestore: FirebaseFirestore): FirestoreDataSource {
        return FirestoreDataSource(firestore)
    }

    @Provides
    @Singleton
    fun provideAuthRepository(auth: FirebaseAuth): AuthRepository {
        return AuthRepositoryImpl(auth)
    }

    @Provides
    @Singleton
    fun provideDeviceIdentityProvider(@ApplicationContext context: Context): DeviceIdentityProvider {
        return DeviceIdentityProvider(context)
    }

    @Provides
    @Singleton
    fun provideUserRepository(
        firestoreDataSource: FirestoreDataSource,
        auth: FirebaseAuth,
        deviceIdentityProvider: DeviceIdentityProvider,
        sharedPreferences: SharedPreferences
    ): UserRepository {
        return UserRepositoryImpl(firestoreDataSource, auth, deviceIdentityProvider, sharedPreferences)
    }

    @Provides
    @Singleton
    fun provideChannelRepository(
        firestoreDataSource: FirestoreDataSource,
        auth: FirebaseAuth,
        deviceIdentityProvider: DeviceIdentityProvider,
        sharedPreferences: SharedPreferences
    ): ChannelRepository {
        return ChannelRepositoryImpl(firestoreDataSource, auth, deviceIdentityProvider, sharedPreferences)
    }
}
