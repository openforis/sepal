package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.openforis.sepal.util.annotation.Data
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.task.api.Task.State.ACTIVE
import static org.openforis.sepal.component.task.api.Task.State.PENDING

@Data(callSuper = true)
class UpdateTaskProgress extends AbstractCommand<Void> {
    String taskId
    Task.State state
    String statusDescription
}

class UpdateTaskProgressHandler implements CommandHandler<Void, UpdateTaskProgress> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager

    UpdateTaskProgressHandler(TaskRepository taskRepository, WorkerSessionManager sessionManager) {
        this.taskRepository = taskRepository
        this.sessionManager = sessionManager
    }

    Void execute(UpdateTaskProgress command) {
        def task = taskRepository.getTask(command.taskId)
        if (![PENDING, ACTIVE].contains(task.state)) {
            LOG.info("Cannot update state of non-pending or active tasks. $task, $command")
            return null
        }

        def updatedTask = task.update(command.state, command.statusDescription)
        taskRepository.update(updatedTask)
        def closeSession = (updatedTask.failed || updatedTask.completed || updatedTask.canceled) &&
                !taskRepository.pendingOrActiveTasksInSession(updatedTask.sessionId)
        if (closeSession)
            sessionManager.closeSession(updatedTask.sessionId)
        else
            sessionManager.heartbeat(updatedTask.sessionId)
        return null
    }
}
