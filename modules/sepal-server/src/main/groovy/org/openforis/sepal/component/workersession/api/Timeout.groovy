package org.openforis.sepal.component.workersession.api

import org.openforis.sepal.util.Clock

import java.util.concurrent.TimeUnit

enum Timeout {
    PENDING(10, TimeUnit.MINUTES),
    ACTIVE(10, TimeUnit.MINUTES)

    final int time
    final TimeUnit timeUnit

    Timeout(int time, TimeUnit timeUnit) {
        this.time = time
        this.timeUnit = timeUnit
    }

    Date get(Clock clock) {
        def timeoutInMillis = timeUnit.toMillis(time)
        new Date(clock.now().time - timeoutInMillis)
    }

    Date lastValidUpdate(Date date) {
        def timeoutInMillis = timeUnit.toMillis(time)
        new Date(date.time - timeoutInMillis)
    }

    Date willTimeout(Date date) {
        def timeoutInMillis = timeUnit.toMillis(time)
        new Date(date.time + timeoutInMillis + 1)
    }
}

