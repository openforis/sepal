package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.*
import org.openforis.sepal.event.EventDispatcher

import static org.openforis.sepal.component.task.Instance.Role.TASK_EXECUTOR
import static org.openforis.sepal.component.task.State.INSTANCE_STARTING
import static org.openforis.sepal.component.task.State.ACTIVE

class SubmitTask extends AbstractCommand<TaskStatus> {
    Task task
    String instanceType
}

class SubmitTaskHandler implements CommandHandler<TaskStatus, SubmitTask> {
    private final TaskRepository taskRepository
    private final InstanceProvider instanceProvider
    private final EventDispatcher eventDispatcher

    SubmitTaskHandler(TaskRepository taskRepository, InstanceProvider instanceProvider, EventDispatcher eventDispatcher) {
        this.taskRepository = taskRepository
        this.instanceProvider = instanceProvider
        this.eventDispatcher = eventDispatcher
    }

    TaskStatus execute(SubmitTask command) {
        return submit(command.instanceType, command.username, command.task)
    }

    private TaskStatus submit(instanceType, username, Task task) {
        def instancesWithCorrectType = instanceProvider.allInstances()
                .findAll { it.type == instanceType }

        def taskExecutorInstance = instancesWithCorrectType.find { it.role == TASK_EXECUTOR && it.username == username }
        if (taskExecutorInstance)
            return submitTaskToExistingInstance(username, task, taskExecutorInstance)

        def idleInstance = instancesWithCorrectType.find { it.role == Instance.Role.IDLE }
        if (idleInstance)
            return provisionIdleInstance(username, task, idleInstance)

        return launchInstance(username, task, instanceType)
    }


    private TaskStatus launchInstance(String username, Task task, String instanceType) {
        def instance = instanceProvider.launchReserved(username, TASK_EXECUTOR, instanceType)
        return insertTaskInRepository(username, task, INSTANCE_STARTING, instance)
    }

    private TaskStatus submitTaskToExistingInstance(String username, Task task, Instance instance) {
        switch (instance.state) {
            case Instance.State.STARTING:
                return insertTaskInRepository(username, task, INSTANCE_STARTING, instance)
            case Instance.State.PROVISIONING:
                return insertTaskInRepository(username, task, State.PROVISIONING, instance)
            case Instance.State.ACTIVE:
                return submitTaskToInstance(username, task, instance)
        }
        throw new IllegalStateException("Unexpected instance state: $instance.state")
    }

    private TaskStatus provisionIdleInstance(String username, Task task, Instance instance) {
        instanceProvider.instanceProvisioning(instance, username, TASK_EXECUTOR)
        return insertTaskInRepository(username, task, State.PROVISIONING, instance)
    }

    private TaskStatus submitTaskToInstance(String username, Task task, Instance instance) {
        return insertTaskInRepository(username, task, ACTIVE, instance)
    }

    private TaskStatus insertTaskInRepository(String username, Task task, State state, Instance instance) {
        return taskRepository.insert(new TaskStatus(
                username: username,
                state: state,
                instanceId: instance.id,
                task: task
        ))
    }
}
