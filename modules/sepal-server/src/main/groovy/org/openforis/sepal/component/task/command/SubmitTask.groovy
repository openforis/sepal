package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.*

import static org.openforis.sepal.component.task.Instance.Role.TASK_EXECUTOR
import static org.openforis.sepal.component.task.State.ACTIVE
import static org.openforis.sepal.component.task.State.INSTANCE_STARTING

class SubmitTask extends AbstractCommand<Task> {
    Operation task
    String instanceType
}

class SubmitTaskHandler implements CommandHandler<Task, SubmitTask> {
    private final TaskRepository taskRepository
    private final InstanceProvider instanceProvider
    private final TaskExecutorGateway taskExecutorGateway

    SubmitTaskHandler(
            TaskRepository taskRepository,
            InstanceProvider instanceProvider,
            TaskExecutorGateway taskExecutorGateway) {
        this.taskRepository = taskRepository
        this.instanceProvider = instanceProvider
        this.taskExecutorGateway = taskExecutorGateway
    }

    Task execute(SubmitTask command) {
        return submit(command.instanceType, command.username, command.task)
    }

    private Task submit(instanceType, username, Operation operation) {
        def instancesWithCorrectType = instanceProvider.allInstances().findAll { it.type == instanceType }

        def taskExecutorInstance = instancesWithCorrectType.find {
            it.username == username && it.role == TASK_EXECUTOR
        }
        if (taskExecutorInstance)
            return submitTaskToExistingInstance(username, operation, taskExecutorInstance)

        def idleInstance = instancesWithCorrectType.find { it.role == Instance.Role.IDLE }
        if (idleInstance)
            return provisionIdleInstance(username, operation, idleInstance)

        return launchInstance(username, operation, instanceType)
    }


    private Task launchInstance(String username, Operation operation, String instanceType) {
        def instance = instanceProvider.launchReserved(username, TASK_EXECUTOR, instanceType)
        return insertTaskInRepository(username, operation, INSTANCE_STARTING, instance)
    }

    private Task submitTaskToExistingInstance(String username, Operation operation, Instance instance) {
        switch (instance.state) {
            case Instance.State.STARTING:
                return insertTaskInRepository(username, operation, INSTANCE_STARTING, instance)
            case Instance.State.PROVISIONING:
                return insertTaskInRepository(username, operation, State.PROVISIONING, instance)
            case Instance.State.ACTIVE:
                return executeTask(username, operation, instance)
        }
        throw new IllegalStateException("Unexpected instance state: $instance.state")
    }

    private Task provisionIdleInstance(String username, Operation operation, Instance instance) {
        instanceProvider.instanceProvisioning(instance, username, TASK_EXECUTOR)
        return insertTaskInRepository(username, operation, State.PROVISIONING, instance)
    }

    private Task executeTask(String username, Operation operation, Instance instance) {
        def task = insertTaskInRepository(username, operation, ACTIVE, instance)
        taskExecutorGateway.execute(task, instance)
        return task
    }

    private Task insertTaskInRepository(String username, Operation operation, State state, Instance instance) {
        return taskRepository.insert(new Task(
                username: username,
                state: state,
                instanceId: instance.id,
                operation: operation
        ))
    }
}
