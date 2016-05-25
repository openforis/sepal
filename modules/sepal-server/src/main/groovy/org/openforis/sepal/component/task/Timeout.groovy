package org.openforis.sepal.component.task

import org.openforis.sepal.util.Clock

import java.util.concurrent.TimeUnit

enum Timeout {
    INSTANCE_STARTING(10, TimeUnit.MINUTES),
    PROVISIONING(10, TimeUnit.MINUTES),
    ACTIVE(10, TimeUnit.MINUTES)

    final int time
    final TimeUnit timeUnit

    Timeout(int time, TimeUnit timeUnit) {
        this.time = time
        this.timeUnit = timeUnit
    }

    Date get(Clock clock) {
        def timeoutInMillis = timeUnit.toMillis(time)
        new Date(clock.now().time + timeoutInMillis)
    }
}
