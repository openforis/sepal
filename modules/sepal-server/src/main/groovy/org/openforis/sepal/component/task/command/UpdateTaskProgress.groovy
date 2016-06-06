package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.InvalidCommand
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerSessionManager

import static org.openforis.sepal.component.task.api.Task.State.ACTIVE
import static org.openforis.sepal.component.task.api.Task.State.PENDING

class UpdateTaskProgress extends AbstractCommand<Void> {
    String taskId
    Task.State state
    String statusDescription
}

class UpdateTaskProgressHandler implements CommandHandler<Void, UpdateTaskProgress> {
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager

    UpdateTaskProgressHandler(TaskRepository taskRepository, WorkerSessionManager sessionManager) {
        this.taskRepository = taskRepository
        this.sessionManager = sessionManager
    }

    Void execute(UpdateTaskProgress command) {
        def task = taskRepository.getTask(command.taskId)
        if (![PENDING, ACTIVE].contains(task.state))
            throw new InvalidCommand("Only pending and active tasks can have their progress updated", command)

        def updatedTask = task.update(command.state, command.statusDescription)
        taskRepository.update(updatedTask)
        if (updatedTask.failed || updatedTask.completed) {
            if (!taskRepository.pendingOrActiveTasksInSession(updatedTask.sessionId))
                sessionManager.closeSession(updatedTask.sessionId)
        }
        sessionManager.heartbeat(updatedTask.sessionId)
        return null
    }
}
