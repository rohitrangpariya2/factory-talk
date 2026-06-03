package com.factorytalk.app.service

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class AutoTrackingSchedulerTest {
    @Test
    fun trackingWindowStartsAtNineAm() {
        assertTrue(AutoTrackingScheduler.isWithinTrackingWindow(calendarAt(9, 0)))
    }

    @Test
    fun trackingWindowStopsAtEightPm() {
        assertFalse(AutoTrackingScheduler.isWithinTrackingWindow(calendarAt(20, 0)))
    }

    @Test
    fun trackingWindowRejectsBeforeNineAm() {
        assertFalse(AutoTrackingScheduler.isWithinTrackingWindow(calendarAt(8, 59)))
    }

    private fun calendarAt(hour: Int, minute: Int): Calendar {
        return Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
    }
}
