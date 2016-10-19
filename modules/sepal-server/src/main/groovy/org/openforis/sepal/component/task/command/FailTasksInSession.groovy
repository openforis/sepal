package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.api.TaskRepository
import org.openforis.sepal.util.annotation.Data
import org.slf4j.LoggerFactory

@Data
class FailTasksInSession extends AbstractCommand<Void> {
    String sessionId
    String description
}

class FailTasksInSessionHandler implements CommandHandler<Void, FailTasksInSession> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository

    FailTasksInSessionHandler(TaskRepository taskRepository) {
        this.taskRepository = taskRepository
    }

    Void execute(FailTasksInSession command) {
        def tasks = taskRepository.pendingOrActiveTasksInSession(command.sessionId)
        tasks.each {
            LOG.warn("Updating state to failed: ${it}, description: $command.description")
            taskRepository.update(it.fail(command.description))
        }
        return null
    }
}
