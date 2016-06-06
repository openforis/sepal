package org.openforis.sepal.util

import groovy.transform.Immutable

import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

interface JobScheduler {
    JobScheduler schedule(long initialDelay, long delay, TimeUnit timeUnit, Closure job)

    void stop()
}

class ExecutorServiceBasedJobScheduler implements JobScheduler {
    private final ScheduledExecutorService executorService

    ExecutorServiceBasedJobScheduler(ScheduledExecutorService executorService) {
        this.executorService = executorService
    }

    ExecutorServiceBasedJobScheduler schedule(long initialDelay, long delay, TimeUnit timeUnit, Closure job) {
        executorService.scheduleWithFixedDelay(job, initialDelay, delay, timeUnit)
        return this
    }

    void stop() {
        executorService.shutdownNow()
    }
}
