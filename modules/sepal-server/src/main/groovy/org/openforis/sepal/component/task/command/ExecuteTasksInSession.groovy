package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.*
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class ExecuteTasksInSession extends AbstractCommand<Void> {
    WorkerSession session
}

class ExecuteTasksInSessionHandler implements CommandHandler<Void, ExecuteTasksInSession> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager
    private final WorkerGateway workerGateway

    ExecuteTasksInSessionHandler(TaskRepository taskRepository, WorkerSessionManager sessionManager, WorkerGateway workerGateway) {
        this.taskRepository = taskRepository
        this.sessionManager = sessionManager
        this.workerGateway = workerGateway
    }

    Void execute(ExecuteTasksInSession command) {
        def tasks = taskRepository.pendingOrActiveTasksInSession(command.session.id)
        tasks.each {
            executeTask(it, command.session)
        }
        return null
    }

    private void executeTask(Task task, WorkerSession session) {
        try {
            workerGateway.execute(task, session)
            taskRepository.update(task.activate())
        } catch (Exception e) {
            LOG.error("Failed to submit task: $task", e)
            taskRepository.update(task.fail('Failed to submit task'))
            def tasksInSession = taskRepository.pendingOrActiveTasksInSession(task.sessionId)
            if (!tasksInSession) {
                LOG.debug("No tasks in session, closing session")
                sessionManager.closeSession(task.sessionId)
            }
        }
    }

}
