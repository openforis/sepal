package org.openforis.sepal.taskexecutor.api

interface BackgroundExecutor {
    TaskExecution execute(TaskExecutor taskExecutor)

    void onCompleted(Closure listener)

    void stop()
}