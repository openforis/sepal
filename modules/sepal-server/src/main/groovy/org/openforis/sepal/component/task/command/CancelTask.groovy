package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSession
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.openforis.sepal.component.task.internal.TaskGateway
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.task.api.Task.State.ACTIVE
import static org.openforis.sepal.component.task.api.Task.State.PENDING
import static org.openforis.sepal.component.task.api.Task.State.CANCELING

@EqualsAndHashCode(callSuper = true)
@Canonical
class CancelTask extends AbstractCommand<Task> {
    String taskId
}

class CancelTaskHandler implements CommandHandler<Task, CancelTask> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskGateway taskGateway
    private final WorkerSessionManager sessionManager
    private final WorkerGateway workerGateway

    CancelTaskHandler(TaskGateway taskGateway, WorkerSessionManager sessionManager, WorkerGateway workerGateway) {
        this.taskGateway = taskGateway
        this.workerGateway = workerGateway
        this.sessionManager = sessionManager
    }

    Task execute(CancelTask command) {
        def task = taskGateway.getTask(command.taskId)
        if (task.username && task.username != command.username)
            throw new Unauthorized("Task not owned by user: $task", command)
        if (![PENDING, ACTIVE, CANCELING].contains(task.state)) {
            LOG.info("Cannot update state unless pending, active, or canceling. $task, $command")
            return null
        }

        def cancelingTask = task.canceling()
        taskGateway.update(cancelingTask)
        if (task.state != PENDING) {
            def session = sessionManager.findSessionById(task.sessionId)
            cancelTaskInWorker(task, session)
        }
        return cancelingTask
    }

    private cancelTaskInWorker(Task task, WorkerSession session) {
        try {
            workerGateway.cancel(task.id, session)
        } catch (Exception e) {
            LOG.warn("Failed to cancel task in worker: $task", e)
        }
    }
}
