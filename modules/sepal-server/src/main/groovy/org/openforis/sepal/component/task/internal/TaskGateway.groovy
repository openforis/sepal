package org.openforis.sepal.component.task.internal

import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.transaction.TransactionManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class TaskGateway {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository
    private final TransactionManager transactionManager

    TaskGateway(TaskRepository taskRepository, TransactionManager transactionManager) {
        this.taskRepository = taskRepository
        this.transactionManager = transactionManager
    }

    Task getTask(String taskId) {
        taskRepository.getTask(taskId)
    }

    List<Task> timedOutTasks() {
        taskRepository.timedOutTasks()
    }

    List<Task> pendingOrActiveTasksInSession(String sessionId) {
        taskRepository.pendingOrActiveTasksInSession(sessionId)
    }

    void update(Task task) {
        taskRepository.update(task)
    }
}
