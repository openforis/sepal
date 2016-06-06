package org.openforis.sepal.util

import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

interface JobScheduler {
    void schedule(long initialDelay, long delay, TimeUnit timeUnit, Closure job)

    void stop()
}

class ExecutorServiceBasedJobScheduler implements JobScheduler {
    private final ScheduledExecutorService executorService

    ExecutorServiceBasedJobScheduler(ScheduledExecutorService executorService) {
        this.executorService = executorService
    }

    void schedule(long initialDelay, long delay, TimeUnit timeUnit, Closure job) {
        executorService.scheduleWithFixedDelay(job, initialDelay, delay, timeUnit)
    }

    void stop() {
        executorService.shutdownNow()
    }
}
