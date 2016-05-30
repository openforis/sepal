package org.openforis.sepal.component.task.api

interface WorkerGateway {
    void execute(Task task, WorkerSession session)

    void cancel(String taskId, WorkerSession session)
}