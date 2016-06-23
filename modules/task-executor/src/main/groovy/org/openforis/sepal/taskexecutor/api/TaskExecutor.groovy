package org.openforis.sepal.taskexecutor.api

interface TaskExecutor {
    String getTaskId()

    void execute()

    void cancel()

    Progress progress()
}
