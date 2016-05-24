package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.InstanceProvider
import org.openforis.sepal.component.task.State
import org.openforis.sepal.component.task.TaskExecutorGateway
import org.openforis.sepal.component.task.TaskRepository

class CancelTask extends AbstractCommand<Void> {
    long taskId
}

class CancelTaskHandler implements CommandHandler<Void, CancelTask> {
    private final TaskRepository taskRepository
    private final InstanceProvider instanceProvider
    private final TaskExecutorGateway taskExecutorGateway

    CancelTaskHandler(
            TaskRepository taskRepository,
            InstanceProvider instanceProvider,
            TaskExecutorGateway taskExecutorGateway) {
        this.taskRepository = taskRepository
        this.instanceProvider = instanceProvider
        this.taskExecutorGateway = taskExecutorGateway
    }

    Void execute(CancelTask command) {
        def task = taskRepository.updateStateAndReturnIt(command.taskId, State.CANCELED)
        def instance = instanceProvider.getInstance(task.instanceId)
        taskExecutorGateway.cancel(task, instance)
        return null
    }

}
