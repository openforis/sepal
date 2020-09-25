package org.openforis.sepal.component.task.internal

import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.transaction.TransactionManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class TaskGateway {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository
    private final TransactionManager transactionManager
    private final MessageQueue<Task> messageQueue

    TaskGateway(TaskRepository taskRepository, TransactionManager transactionManager, MessageBroker messageBroker) {
        this.taskRepository = taskRepository
        this.transactionManager = transactionManager
        this.messageQueue = messageBroker.createMessageQueue('task.failedOrCompleted', Task) { Task task ->
            LOG.debug('Task completed or failed: ' + task)
        }
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
        if (task.failed || task.completed) {
            transactionManager.withTransaction {
                taskRepository.update(task)
                messageQueue.publish(task)
            }
        } else {
            taskRepository.update(task)
        }
    }
}
