package org.openforis.sepal.taskexecutor.api

interface TaskExecutor {
    void execute()

    void cancel()

    Progress progress()
}
