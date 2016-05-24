package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.InstanceProvider
import org.openforis.sepal.component.task.TaskExecutorGateway
import org.openforis.sepal.component.task.TaskRepository

class SubmitTasksToTaskExecutor extends AbstractCommand<Void> {
    Instance instance
}

class SubmitTasksToTaskExecutorHandler implements CommandHandler<Void, SubmitTasksToTaskExecutor> {
    private final TaskRepository taskRepository
    private final InstanceProvider instanceProvider
    private final TaskExecutorGateway taskExecutorGateway

    SubmitTasksToTaskExecutorHandler(
            TaskRepository taskRepository,
            InstanceProvider instanceProvider,
            TaskExecutorGateway taskExecutorGateway) {
        this.taskRepository = taskRepository
        this.instanceProvider = instanceProvider
        this.taskExecutorGateway = taskExecutorGateway
    }

    Void execute(SubmitTasksToTaskExecutor command) {
        instanceProvider.instanceActive(command.instance) // TODO: This is backwards - not related to submitting
        def tasks = taskRepository.instanceActive(command.instance.id) // TODO: Rename - we're submitting them
        // Submit tasks through gateway
        return null
    }
}
