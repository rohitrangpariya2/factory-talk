package com.factorytalk.app.data.remote

import android.util.Log
import com.factorytalk.app.data.model.ServerHealthStatus
import com.factorytalk.app.util.Constants
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ServerHealthMonitor @Inject constructor() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var keepAliveJob: Job? = null

    private val _status = MutableStateFlow(ServerHealthStatus.UNKNOWN)
    val status: StateFlow<ServerHealthStatus> = _status.asStateFlow()

    fun start(serverUrl: String) {
        if (keepAliveJob?.isActive == true) return

        keepAliveJob = scope.launch {
            while (isActive) {
                check(serverUrl)
                delay(Constants.SERVER_KEEP_ALIVE_INTERVAL_MS)
            }
        }
    }

    fun stop() {
        keepAliveJob?.cancel()
        keepAliveJob = null
        _status.value = ServerHealthStatus.UNKNOWN
    }

    suspend fun check(serverUrl: String): Boolean {
        _status.value = ServerHealthStatus.CHECKING
        return runCatching {
            withContext(Dispatchers.IO) {
                val healthUrl = serverUrl.trimEnd('/') + "/health"
                val connection = URL(healthUrl).openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = Constants.SERVER_HEALTH_TIMEOUT_MS
                connection.readTimeout = Constants.SERVER_HEALTH_TIMEOUT_MS
                connection.useCaches = false
                try {
                    connection.responseCode in 200..299
                } finally {
                    connection.disconnect()
                }
            }
        }.onSuccess { ok ->
            _status.value = if (ok) ServerHealthStatus.AWAKE else ServerHealthStatus.OFFLINE
        }.onFailure { error ->
            Log.w("ServerHealthMonitor", "Health check failed", error)
            _status.value = ServerHealthStatus.OFFLINE
        }.getOrDefault(false)
    }
}
