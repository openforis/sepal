package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.*
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class CancelTimedOutTasks extends AbstractCommand<Void> {
}

class CancelTimedOutTasksHandler implements CommandHandler<Void, CancelTimedOutTasks> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager
    private final WorkerGateway workerGateway

    CancelTimedOutTasksHandler(TaskRepository taskRepository, WorkerSessionManager sessionManager, WorkerGateway workerGateway) {
        this.taskRepository = taskRepository
        this.sessionManager = sessionManager
        this.workerGateway = workerGateway
    }

    Void execute(CancelTimedOutTasks command) {
        def timedOutTasks = taskRepository.timedOutTasks()
        timedOutTasks.each {
            LOG.warn("Updating state of timed out task to failed: ${it}")
            taskRepository.update(it.fail())
        }
        def sessionById = timedOutTasks.findAll { it.sessionId }.unique().collectEntries() {
            [(it.sessionId): sessionManager.findSessionById(it.sessionId)]
        } as Map<String, WorkerSession>

        timedOutTasks
            .findAll { it.active }
            .each { cancelTask(it, sessionById[it.sessionId]) }

        sessionById.keySet().each {
            def tasksInSession = taskRepository.pendingOrActiveTasksInSession(it)
            if (!tasksInSession)
                sessionManager.closeSession(it)
        }
        return null
    }

    private cancelTask(Task task, WorkerSession session) {
        try {
            workerGateway.cancel(task.id, session)
        } catch (Exception e) {
            LOG.warn("Failed to cancel task: $task", e)
        }
    }
}