package org.openforis.sepal.util

import java.util.concurrent.ExecutorService

interface JobExecutor {
    void execute(Closure job)

    void stop()
}

class ExecutorServiceBasedJobExecutor implements JobExecutor {

    private final ExecutorService executor

    ExecutorServiceBasedJobExecutor(ExecutorService executor) {
        this.executor = executor
    }

    @Override
    public void execute(Closure job) {
        executor.execute(job as Runnable)
    }

    @Override
    public void stop() {
        executor.shutdown()
    }


}