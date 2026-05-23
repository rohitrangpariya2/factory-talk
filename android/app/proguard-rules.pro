# ProGuard rules for Factory Talk

# Keep Hilt generated code
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }

# Socket.IO
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn io.socket.**

# WebRTC
-keep class org.webrtc.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.factorytalk.app.data.model.** { *; }

# Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
