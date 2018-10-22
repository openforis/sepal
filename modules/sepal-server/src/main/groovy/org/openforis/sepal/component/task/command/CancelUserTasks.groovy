package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSession
import org.openforis.sepal.component.task.api.WorkerSessionManager

@EqualsAndHashCode(callSuper = true)
@Canonical
class CancelUserTasks extends AbstractCommand<Void> {
}

class CancelUserTasksHandler implements CommandHandler<Void, CancelUserTasks> {
    private final TaskRepository taskRepository
    private final WorkerSessionManager sessionManager
    private final WorkerGateway workerGateway

    CancelUserTasksHandler(TaskRepository taskRepository, WorkerSessionManager sessionManager, WorkerGateway workerGateway) {
        this.taskRepository = taskRepository
        this.sessionManager = sessionManager
        this.workerGateway = workerGateway
    }

    Void execute(CancelUserTasks command) {
        def tasks = taskRepository.pendingOrActiveUserTasks(command.username)
        tasks.each { taskRepository.update(it.cancel()) }

        def sessionById = tasks.findAll { it.sessionId }.unique().collectEntries() {
            [(it.sessionId): sessionManager.findSessionById(it.sessionId)]
        } as Map<String, WorkerSession>

        tasks.findAll { it.active }
            .each { workerGateway.cancel(it.id, sessionById[it.sessionId]) }

        sessionById.keySet().each { sessionManager.closeSession(it) }
        return null
    }
}
