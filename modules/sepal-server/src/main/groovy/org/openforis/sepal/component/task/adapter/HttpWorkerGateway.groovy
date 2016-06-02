package org.openforis.sepal.component.task.adapter

import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSession

class HttpWorkerGateway implements WorkerGateway {
    void execute(Task task, WorkerSession session) {

    }

    void cancel(String taskId, WorkerSession session) {

    }
}
