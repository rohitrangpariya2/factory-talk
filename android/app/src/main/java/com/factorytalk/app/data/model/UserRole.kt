package com.factorytalk.app.data.model

enum class UserRole(val priority: Int) {
    OWNER(4),
    ADMIN(3),
    SUPERVISOR(2),
    WORKER(1)
}
