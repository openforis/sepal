package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.command.Unauthorized
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.openforis.sepal.util.annotation.Data
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.task.api.Task.State.ACTIVE
import static org.openforis.sepal.component.task.api.Task.State.PENDING

@Data(callSuper = true)
class CancelTask extends AbstractCommand<Void> {
    String taskId
}

class CancelTaskHandler implements CommandHandler<Void, CancelTask> {
    private static final LOG = LoggerFactory.getLogger(this)
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
            throw new Unauthorized("Task not owned by user: $task", command)
        if (![PENDING, ACTIVE].contains(task.state)) {
            LOG.info("Cannot update state of non-pending or active tasks. $task, $command")
            return null
        }

        taskRepository.update(task.cancel())
        def session = sessionManager.findSessionById(task.sessionId)
        workerGateway.cancel(task.id, session)
        def tasksInSession = taskRepository.pendingOrActiveTasksInSession(session.id)
        if (!tasksInSession)
            sessionManager.closeSession(session.id)
        return null
    }
}
