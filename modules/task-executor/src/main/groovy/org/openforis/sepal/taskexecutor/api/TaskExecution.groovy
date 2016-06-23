package org.openforis.sepal.taskexecutor.api

interface TaskExecution {
    String getTaskId()

    Progress progress()

    void cancel()

}
