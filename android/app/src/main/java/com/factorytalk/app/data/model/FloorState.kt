package com.factorytalk.app.data.model

sealed class FloorState {
    object Idle : FloorState()
    data class Granted(
        val speakerName: String,
        val speakerRole: UserRole,
        val isSelf: Boolean
    ) : FloorState()
    data class Denied(val reason: String) : FloorState()
    data class Revoked(val reason: String) : FloorState()
}
