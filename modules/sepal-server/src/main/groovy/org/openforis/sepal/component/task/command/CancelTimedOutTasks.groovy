package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSession
import org.openforis.sepal.component.task.api.WorkerSessionManager

class CancelTimedOutTasks extends AbstractCommand<Void> {
}

class CancelTimedOutTasksHandler implements CommandHandler<Void, CancelTimedOutTasks> {
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
            taskRepository.update(it.fail())
        }
        def sessionById = timedOutTasks.findAll { it.sessionId }.unique().collectEntries() {
            [(it.sessionId): sessionManager.findSessionById(it.sessionId)]
        } as Map<String, WorkerSession>

        timedOutTasks
                .findAll { it.active }
                .each { workerGateway.cancel(it.id, sessionById[it.sessionId]) }

        sessionById.keySet().each {
            def tasksInSession = taskRepository.pendingOrActiveTasksInSession(it)
            if (!tasksInSession)
                sessionManager.closeSession(it)
        }
        return null
    }
}