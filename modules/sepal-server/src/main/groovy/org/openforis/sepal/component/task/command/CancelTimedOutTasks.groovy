package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.NonTransactionalCommandHandler
import org.openforis.sepal.component.task.api.*
import org.openforis.sepal.component.task.internal.TaskGateway
import org.openforis.sepal.transaction.TransactionManager
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class CancelTimedOutTasks extends AbstractCommand<Void> {
}

class CancelTimedOutTasksHandler implements NonTransactionalCommandHandler<Void, CancelTimedOutTasks> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskGateway taskGateway
    private final WorkerSessionManager sessionManager
    private final WorkerGateway workerGateway
    private final TransactionManager transactionManager

    CancelTimedOutTasksHandler(TaskGateway taskGateway, WorkerSessionManager sessionManager, WorkerGateway workerGateway, TransactionManager transactionManager) {
        this.taskGateway = taskGateway
        this.sessionManager = sessionManager
        this.workerGateway = workerGateway
        this.transactionManager = transactionManager
    }

    Void execute(CancelTimedOutTasks command) {
        def timedOutTasks = taskGateway.timedOutTasks()
        timedOutTasks.each {
            if (it.state != Task.State.CANCELING) {
                LOG.warn("Updating state of timed out task to failed: ${it}")
                taskGateway.update(it.fail())
            } else {
                LOG.warn("Canceling task timed out: ${it}")
                taskGateway.update(it.canceled())
            }
        }
        def sessionById = timedOutTasks.findAll { it.sessionId }.unique().collectEntries() {
            [(it.sessionId): sessionManager.findSessionById(it.sessionId)]
        } as Map<String, WorkerSession>

        timedOutTasks
                .findAll { it.active }
                .each { Task task ->
                    transactionManager.withTransaction {
                        cancelTaskInWorker(task, sessionById[task.sessionId])
                    }
                }

        sessionById.keySet().each { String sessionId ->
            def tasksInSession = taskGateway.pendingOrActiveTasksInSession(sessionId)
            if (!tasksInSession)
                transactionManager.withTransaction {
                    sessionManager.closeSession(sessionId)
                }
        }
        return null
    }

    private cancelTaskInWorker(Task task, WorkerSession session) {
        try {
            workerGateway.cancel(task.id, session)
        } catch (Exception e) {
            LOG.warn("Failed to cancel task in worker: $task", e)
        }
    }
}