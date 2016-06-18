package org.openforis.sepal.taskexecutor.api

interface TaskExecutor {
    void execute(Task task)

    void cancel()
}
