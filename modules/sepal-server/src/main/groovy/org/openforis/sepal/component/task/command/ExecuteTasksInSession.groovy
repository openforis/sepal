package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.*
import org.openforis.sepal.component.task.internal.TaskGateway
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class ExecuteTasksInSession extends AbstractCommand<Void> {
    WorkerSession session
}

class ExecuteTasksInSessionHandler implements CommandHandler<Void, ExecuteTasksInSession> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskGateway taskGateway
    private final WorkerSessionManager sessionManager
    private final WorkerGateway workerGateway

    ExecuteTasksInSessionHandler(TaskGateway taskGateway, WorkerSessionManager sessionManager, WorkerGateway workerGateway) {
        this.taskGateway = taskGateway
        this.sessionManager = sessionManager
        this.workerGateway = workerGateway
    }

    Void execute(ExecuteTasksInSession command) {
        def tasks = taskGateway.pendingOrActiveTasksInSession(command.session.id)
        tasks.each {
            executeTask(it, command.session)
        }
        return null
    }

    private void executeTask(Task task, WorkerSession session) {
        try {
            workerGateway.execute(task, session)
            taskGateway.update(task.activate())
        } catch (Exception e) {
            LOG.error("Failed to submit task: $task", e)
            taskGateway.update(task.fail('Failed to submit task'))
            def tasksInSession = taskGateway.pendingOrActiveTasksInSession(task.sessionId)
            if (!tasksInSession) {
                LOG.debug("No tasks in session, closing session")
                sessionManager.closeSession(task.sessionId)
            }
        }
    }

}
