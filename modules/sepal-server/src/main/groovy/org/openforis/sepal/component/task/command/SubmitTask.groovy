package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.openforis.sepal.util.Clock

class SubmitTask extends AbstractCommand<Task> {
    String instanceType
    String operation
    Map params
}

class SubmitTaskHandler implements CommandHandler<Task, SubmitTask> {
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager
    private final WorkerGateway workerGateway
    private final Clock clock

    SubmitTaskHandler(
            TaskRepository taskRepository,
            WorkerSessionManager sessionManager,
            WorkerGateway workerGateway,
            Clock clock) {
        this.taskRepository = taskRepository
        this.sessionManager = sessionManager
        this.workerGateway = workerGateway
        this.clock = clock
    }

    Task execute(SubmitTask command) {
        def session = sessionManager.findPendingOrActiveSession(command.username, command.instanceType) ?:
                sessionManager.requestSession(command.username, command.instanceType)
        def now = clock.now()
        def task = new Task(
                id: UUID.randomUUID().toString(),
                state: Task.State.PENDING,
                username: command.username,
                operation: command.operation,
                params: command.params,
                sessionId: session.id,
                creationTime: now,
                updateTime: now
        )
        if (session.active) {
            task = task.activate()
            workerGateway.execute(task, session)
        }
        taskRepository.insert(task)
        return task
    }
}
