package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.UnauthorizedExecution
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSessionManager

class CancelTask extends AbstractCommand<Void> {
    String taskId
}

class CancelTaskHandler implements CommandHandler<Void, CancelTask> {
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager
    private final WorkerGateway workerGateway

    CancelTaskHandler(TaskRepository taskRepository, WorkerSessionManager sessionManager, WorkerGateway workerGateway) {
        this.taskRepository = taskRepository
        this.workerGateway = workerGateway
        this.sessionManager = sessionManager
    }

    Void execute(CancelTask command) {
        def task = taskRepository.getTask(command.taskId)
        if (task.username && task.username != command.username)
            throw new UnauthorizedExecution("Task not owned by user: $task", command)
        taskRepository.update(task.cancel())
        def session = sessionManager.findSession(task.sessionId)
        if (task.active)
            workerGateway.cancel(command.taskId, session)
        def tasksInSession = taskRepository.pendingOrActiveTasksInSession(session.id)
        if (!tasksInSession)
            sessionManager.closeSession(session.id)
        return null
    }
}
