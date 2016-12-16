package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.AfterCommitCommandHandler
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.openforis.sepal.util.annotation.Data
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.task.api.Task.State.ACTIVE
import static org.openforis.sepal.component.task.api.Task.State.PENDING

@Data(callSuper = true)
class UpdateTaskProgress extends AbstractCommand<Task> {
    String taskId
    Task.State state
    String statusDescription
}

class UpdateTaskProgressHandler implements AfterCommitCommandHandler<Task, UpdateTaskProgress> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager

    UpdateTaskProgressHandler(TaskRepository taskRepository, WorkerSessionManager sessionManager) {
        this.taskRepository = taskRepository
        this.sessionManager = sessionManager
    }

    Task execute(UpdateTaskProgress command) {
        def task = taskRepository.getTask(command.taskId)
        if (![PENDING, ACTIVE].contains(task.state)) {
            LOG.info("Cannot update state of non-pending or active tasks. $task, $command")
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
