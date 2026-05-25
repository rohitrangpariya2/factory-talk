package com.factorytalk.app.data.demo

import com.factorytalk.app.data.model.Channel
import com.factorytalk.app.data.model.ChannelType
import com.factorytalk.app.data.model.User
import com.factorytalk.app.data.model.UserRole
import com.factorytalk.app.util.Constants

object DemoData {
    fun currentUser(
        deviceId: String = Constants.DEMO_USER_ID,
        deviceName: String = Constants.DEMO_USER_NAME,
        role: UserRole = UserRole.WORKER
    ) = User(
        id = deviceId,
        phoneNumber = "+910000000000",
        displayName = deviceName,
        role = role,
        isOnline = true,
        channels = listOf(Constants.DEMO_CHANNEL_ID)
    )

    fun users(
        deviceId: String = Constants.DEMO_USER_ID,
        deviceName: String = Constants.DEMO_USER_NAME,
        role: UserRole = UserRole.WORKER
    ) = listOf(
        currentUser(deviceId, deviceName, role)
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
