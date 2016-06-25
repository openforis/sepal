package org.openforis.sepal.taskexecutor.api

interface BackgroundExecutor {
    void execute(TaskExecutor taskExecutor)

    void cancel(String taskId)

    void stop()
}