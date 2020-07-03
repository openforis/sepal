package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.AfterCommitCommandHandler
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.task.api.Task.State.ACTIVE
import static org.openforis.sepal.component.task.api.Task.State.PENDING
import static org.openforis.sepal.component.task.api.Task.State.CANCELED
import static org.openforis.sepal.component.task.api.Task.State.CANCELING

@EqualsAndHashCode(callSuper = true)
@Canonical
class UpdateTaskProgress extends AbstractCommand<Task> {
    String taskId
    Task.State state
    String statusDescription
}

class UpdateTaskProgressHandler implements AfterCommitCommandHandler<Task, UpdateTaskProgress> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager
    private final CommandHandler<Task, CancelTask> cancelTaskHandler

    UpdateTaskProgressHandler(TaskRepository taskRepository, WorkerSessionManager sessionManager, CommandHandler<Task, CancelTask> cancelTaskHandler) {
        this.taskRepository = taskRepository
        this.sessionManager = sessionManager
        this.cancelTaskHandler = cancelTaskHandler
    }

    Task execute(UpdateTaskProgress command) {
        def task = taskRepository.getTask(command.taskId)
        LOG.debug("Progress update for task $task requested: $command")
        if (command.state == CANCELED && ![PENDING, ACTIVE, CANCELING].contains(task.state)) {
            LOG.info("Cannot cancel unless PENDING, ACTIVE, or CANCELING. $task, $command")
            return null
        } else if (command.state == ACTIVE && task.state == CANCELING) {
            cancelTaskHandler.execute(new CancelTask(taskId: command.taskId, username: task.username))
            return null
        } else if (command.state != CANCELED && ![PENDING, ACTIVE].contains(task.state)) {
            LOG.info("Cannot update state unless PENDING or ACTIVE. $task, $command")
            return null
        }

        def updatedTask = task.update(command.state, command.statusDescription)
        taskRepository.update(updatedTask)
        return updatedTask
    }

    void afterCommit(UpdateTaskProgress command, Task updatedTask) {
        if (!updatedTask || !(updatedTask.failed || updatedTask.completed || updatedTask.canceled)) {
            LOG.debug("No task failed, completed, or was canceled, so no need to close the session: $command")
            if (updatedTask)
                sessionManager.heartbeat(updatedTask.sessionId)
            return
        }

        def tasksInSession = taskRepository.pendingOrActiveTasksInSession(updatedTask.sessionId)
        if (!tasksInSession) {
            LOG.debug("No tasks in session, closing session. ${[canceledTask: updatedTask, command: command]}")
            sessionManager.closeSession(updatedTask.sessionId)
        } else {
            LOG.debug("There still are tasks in session, will not close it. " +
                    "${[tasksInSession: tasksInSession, canceledTask: updatedTask, command: command]}")
            sessionManager.heartbeat(updatedTask.sessionId)
        }
    }
}
