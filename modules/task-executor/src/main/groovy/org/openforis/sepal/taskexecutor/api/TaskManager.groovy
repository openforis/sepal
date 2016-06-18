package org.openforis.sepal.taskexecutor.api

interface TaskManager {
    void execute(Task task)

    void cancel(String taskId)
}
