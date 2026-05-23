package com.factorytalk.app.data.demo

import com.factorytalk.app.data.model.Channel
import com.factorytalk.app.data.model.ChannelType
import com.factorytalk.app.data.model.User
import com.factorytalk.app.data.model.UserRole
import com.factorytalk.app.util.Constants

object DemoData {
    fun currentUser(deviceId: String = Constants.DEMO_USER_ID, deviceName: String = Constants.DEMO_USER_NAME) = User(
        id = deviceId,
        phoneNumber = "+910000000000",
        displayName = deviceName,
        role = UserRole.OWNER,
        isOnline = true,
        channels = listOf(Constants.DEMO_CHANNEL_ID)
    )

    fun users(deviceId: String = Constants.DEMO_USER_ID, deviceName: String = Constants.DEMO_USER_NAME) = listOf(
        currentUser(deviceId, deviceName),
        User(
            id = "demo-supervisor",
            phoneNumber = "+910000000001",
            displayName = "Demo Supervisor",
            role = UserRole.SUPERVISOR,
            isOnline = true,
            channels = listOf(Constants.DEMO_CHANNEL_ID)
        ),
        User(
            id = "demo-worker",
            phoneNumber = "+910000000002",
            displayName = "Demo Worker",
            role = UserRole.WORKER,
            isOnline = true,
            channels = listOf(Constants.DEMO_CHANNEL_ID)
        )
    )

    fun commonChannel(deviceId: String = Constants.DEMO_USER_ID, deviceName: String = Constants.DEMO_USER_NAME) = Channel(
        id = Constants.DEMO_CHANNEL_ID,
        name = Constants.DEMO_CHANNEL_NAME,
        type = ChannelType.COMMON,
        members = users(deviceId, deviceName).map { it.id },
        createdBy = deviceId
    )

    fun channels(deviceId: String = Constants.DEMO_USER_ID, deviceName: String = Constants.DEMO_USER_NAME) =
        listOf(commonChannel(deviceId, deviceName))
}
