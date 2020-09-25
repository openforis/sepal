package org.openforis.sepal.component.task.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.internal.TaskGateway
import org.slf4j.LoggerFactory

@EqualsAndHashCode(callSuper = true)
@Canonical
class FailTasksInSession extends AbstractCommand<Void> {
    String sessionId
    String description
}

class FailTasksInSessionHandler implements CommandHandler<Void, FailTasksInSession> {
    private static final LOG = LoggerFactory.getLogger(this)
    private final TaskGateway taskGateway

    FailTasksInSessionHandler(TaskGateway taskGateway) {
        this.taskGateway = taskGateway
    }

    Void execute(FailTasksInSession command) {
        def tasks = taskGateway.pendingOrActiveTasksInSession(command.sessionId)
        tasks.each {
            LOG.warn("Updating state to failed: ${it}, description: $command.description")
            taskGateway.update(it.fail(command.description))
        }
        return null
    }
}
