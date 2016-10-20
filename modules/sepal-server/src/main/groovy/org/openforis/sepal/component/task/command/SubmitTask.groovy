package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.Task
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSessionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.annotation.Data
import org.slf4j.LoggerFactory

@Data(callSuper = true)
class SubmitTask extends AbstractCommand<Task> {
    String instanceType
    String operation
    Map params
}

class SubmitTaskHandler implements CommandHandler<Task, SubmitTask> {
    private static final LOG = LoggerFactory.getLogger(this)
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
        def username = command.username
        def instanceType = command.instanceType ?: sessionManager.defaultInstanceType
        def session = sessionManager.findPendingOrActiveSession(username, instanceType)
        if (session)
            LOG.debug("Submitting task to existing session: ${[command: command, session: session]}")
        else {
            session = sessionManager.requestSession(username, instanceType)
            LOG.debug("No existing session, submitting task to newly created: ${[command: command, session: session]}")
        }
        def now = clock.now()
        def task = new Task(
                id: UUID.randomUUID().toString(),
                state: Task.State.PENDING,
                username: username,
                operation: command.operation,
                params: command.params,
                sessionId: session.id,
                creationTime: now,
                updateTime: now
        )
        if (session.active) {
            task = task.activate()
            LOG.debug("Session is active, executing task: ${[command: command, session: session, task: task]}")
            workerGateway.execute(task, session)
        } else
            LOG.debug("Session is not active, will not execute task: ${[command: command, session: session, task: task]}")
        taskRepository.insert(task)
        return task
    }
}
