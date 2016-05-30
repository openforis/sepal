package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerSessionManager

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
                .update(command.state, command.statusDescription)
        taskRepository.update(task)
        if (task.failed || task.completed) {
            if (!taskRepository.pendingOrActiveTasksInSession(task.sessionId))
                sessionManager.closeSession(task.sessionId)
        }
        sessionManager.heartbeat(task.sessionId)
        return null
    }
}
