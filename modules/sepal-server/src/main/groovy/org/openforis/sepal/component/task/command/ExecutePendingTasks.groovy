package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.*

class ExecutePendingTasks extends AbstractCommand<Void> {
}

class ExecutePendingTasksHandler implements CommandHandler<Void, ExecutePendingTasks> {
    private final TaskRepository taskRepository
    private final InstanceProvider instanceProvider
    private final TaskExecutorGateway taskExecutorGateway

    ExecutePendingTasksHandler(
            TaskRepository taskRepository,
            InstanceProvider instanceProvider,
            TaskExecutorGateway taskExecutorGateway) {
        this.taskRepository = taskRepository
        this.instanceProvider = instanceProvider
        this.taskExecutorGateway = taskExecutorGateway
    }

    Void execute(ExecutePendingTasks command) {
        def activeInstances = instanceProvider.allTaskExecutors().findAll {
            it.state == Instance.State.ACTIVE
        }
        if (activeInstances == null)
            return null
        taskRepository.eachPendingTask(activeInstances) { Task task, Instance instance ->
            taskExecutorGateway.execute(task, instance)
        }
        return null
    }
}
