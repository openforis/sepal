package org.openforis.sepal.component.task

import groovy.transform.Immutable
import org.openforis.sepal.util.Clock
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static org.openforis.sepal.component.task.Instance.Role.TASK_EXECUTOR
import static org.openforis.sepal.component.task.State.*

class TaskManager {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final TaskRepository taskRepository
    private final InstanceProvider instanceProvider
    private final Clock clock

    TaskManager(
            TaskRepository taskRepository,
            InstanceProvider instanceProvider,
            Clock clock) {
        this.taskRepository = taskRepository
        this.instanceProvider = instanceProvider
        this.clock = clock
    }

    TaskStatus submitTask(String username, Task task, String instanceType) {
        def instancesWithCorrectType = instanceProvider.allInstances()
                .findAll { it.type == instanceType }

        def taskExecutorInstance = instancesWithCorrectType.find { it.role == TASK_EXECUTOR && it.username == username }
        if (taskExecutorInstance)
            return submitTaskToExistingInstance(username, task, taskExecutorInstance)

        def idleInstance = instancesWithCorrectType.find { it.idle }
        if (idleInstance)
            return deployToIdleInstance(username, task, idleInstance)

        return launchInstance(username, task, instanceType)
    }

    void cancel(long taskId) {
        def status = updateTaskStateInRepository(taskId, CANCELED)
        instanceProvider.release(status.instanceId)
    }

    private TaskStatus launchInstance(String username, Task task, String instanceType) {
        def instance = instanceProvider.launchReserved(username, TASK_EXECUTOR, instanceType)
        return insertTaskInRepository(username, task, STARTING_INSTANCE, instance)
    }

    private TaskStatus submitTaskToExistingInstance(String username, Task task, Instance instance) {
        switch (instance.state) {
            case Instance.State.STARTING:
                return insertTaskInRepository(username, task, STARTING_INSTANCE, instance)
            case Instance.State.DEPLOYING:
                return insertTaskInRepository(username, task, DEPLOYING, instance)
            case Instance.State.ACTIVE:
                return submitTaskToInstance(username, task, instance)
        }
        throw new IllegalStateException("Unexpected instance state: $instance.state")
    }

    private TaskStatus deployToIdleInstance(String username, Task task, Instance instance) {
        instanceProvider.reserve(instance, username, TASK_EXECUTOR, Instance.State.DEPLOYING)
        return insertTaskInRepository(username, task, DEPLOYING, instance)
    }

    private TaskStatus submitTaskToInstance(String username, Task task, Instance instance) {
        return insertTaskInRepository(username, task, SUBMITTED, instance)
    }

    private TaskStatus insertTaskInRepository(String username, Task task, State state, Instance instance) {
        return taskRepository.insert(new TaskStatus(
                username: username,
                state: state,
                instanceId: instance.id,
                task: task
        ))
    }

    private TaskStatus updateTaskStateInRepository(long taskId, State state) {
        taskRepository.updateState(taskId, state)
    }
}

interface InstanceProvider {
    Instance launchReserved(String username, Instance.Role role, String instanceType)

    Instance launchIdle(String instanceType)

    void reserve(Instance idleInstance, String username, Instance.Role role, Instance.State state)

    List<Instance> allInstances()

    void release(String instanceId)
}

@Immutable
class Instance {
    String id
    String host
    String type
    String username
    Role role
    State state
    boolean idle

    Instance toReserved(String username, Role role, State state) {
        assert idle, 'Expected instance to be idle before reserving it'
        new Instance(id: id, host: host, type: type, username: username, role: role, state: state, idle: false)
    }

    Instance toIdle() {
        assert !idle, 'Did not expect instance to be idle before making it idle'
        new Instance(id: id, host: host, type: type, username: null, role: null, state: null, idle: true)
    }

    enum Role {
        SANDBOX, TASK_EXECUTOR
    }

    enum State {
        STARTING, DEPLOYING, ACTIVE
    }
}