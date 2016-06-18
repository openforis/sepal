package org.openforis.sepal.taskexecutor.manager

import org.openforis.sepal.taskexecutor.api.Task
import org.openforis.sepal.taskexecutor.api.TaskManager
import org.openforis.sepal.taskexecutor.util.Stoppable

class FooTaskManager implements TaskManager, Stoppable {
    void execute(Task task) {

    }

    void cancel(String taskId) {

    }

    void stop() {

    }
}
