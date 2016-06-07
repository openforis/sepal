package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.component.task.api.WorkerGateway
import org.openforis.sepal.component.task.api.WorkerSession
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class ExecuteTasksInSession extends AbstractCommand<Void> {
    WorkerSession session
}

class ExecuteTasksInSessionHandler implements CommandHandler<Void, ExecuteTasksInSession> {
    private final TaskRepository taskRepository
    private final WorkerGateway workerGateway

    ExecuteTasksInSessionHandler(TaskRepository taskRepository, WorkerGateway workerGateway) {
        this.taskRepository = taskRepository
        this.workerGateway = workerGateway
    }

    Void execute(ExecuteTasksInSession command) {
        def tasks = taskRepository.pendingOrActiveTasksInSession(command.session.id)
        tasks.each {
            workerGateway.execute(it, command.session)
            taskRepository.update(it.activate())
        }
        return null
    }
}
