package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.AfterCommitCommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.task.api.Task.State.ACTIVE
import static org.openforis.sepal.component.task.api.Task.State.PENDING

@EqualsAndHashCode(callSuper = true)
@Canonical
class CancelTask extends AbstractCommand<Task> {
    String taskId
}

class CancelTaskHandler implements AfterCommitCommandHandler<Task, CancelTask> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager
    private final WorkerGateway workerGateway

    CancelTaskHandler(TaskRepository taskRepository, WorkerSessionManager sessionManager, WorkerGateway workerGateway) {
        this.taskRepository = taskRepository
        this.workerGateway = workerGateway
        this.sessionManager = sessionManager
    }

    Task execute(CancelTask command) {
        def task = taskRepository.getTask(command.taskId)
        if (task.username && task.username != command.username)
            throw new Unauthorized("Task not owned by user: $task", command)
        if (![PENDING, ACTIVE].contains(task.state)) {
            LOG.info("Cannot update state of non-pending or active tasks. $task, $command")
            return null
        }

        def canceledTask = task.cancel()
        taskRepository.update(canceledTask)
        def session = sessionManager.findSessionById(task.sessionId)
        workerGateway.cancel(task.id, session)

        return canceledTask
    }

    void afterCommit(CancelTask command, Task canceledTask) {
        if (!canceledTask) {
            LOG.debug("No task was canceled, no need to close the session: $command")
            return
        }
        def tasksInSession = taskRepository.pendingOrActiveTasksInSession(canceledTask.sessionId)
        if (!tasksInSession) {
            LOG.debug("No tasks in session, closing session. ${[canceledTask: canceledTask, command: command]}")
            sessionManager.closeSession(canceledTask.sessionId)
        } else {
            LOG.debug("There still are tasks in session, will not close it. " +
                "${[tasksInSession: tasksInSession, canceledTask: canceledTask, command: command]}")
            sessionManager.heartbeat(canceledTask.sessionId)
        }
    }
}
