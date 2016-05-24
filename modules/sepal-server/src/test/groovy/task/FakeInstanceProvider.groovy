package task

import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.InstanceProvider
import org.openforis.sepal.component.task.event.TaskExecutorStarted
import org.openforis.sepal.event.EventDispatcher

class FakeInstanceProvider implements InstanceProvider {
    private final EventDispatcher eventDispatcher
    private final instanceById = [:] as Map<String, Instance>

    FakeInstanceProvider(EventDispatcher eventDispatcher) {
        this.eventDispatcher = eventDispatcher
    }

    Instance launchReserved(String username, Instance.Role role, String instanceType) {
        def instance = new Instance(
                id: UUID.randomUUID().toString(),
                type: instanceType,
                host: UUID.randomUUID().toString(),
                username: username,
                role: role,
                state: Instance.State.STARTING
        )
        instanceById[instance.id] = instance
        return instance
    }

    Instance launchIdle(String instanceType) {
        def instance = new Instance(
                id: UUID.randomUUID().toString(),
                type: instanceType,
                host: UUID.randomUUID().toString(),
                role: Instance.Role.IDLE,
                state: Instance.State.STARTING
        )
        instanceById[instance.id] = instance
        return instance
    }

    void instanceProvisioning(Instance idleInstance, String username, Instance.Role role) {
        assert idleInstance.role == Instance.Role.IDLE
        assert !idleInstance.username

        instanceById[idleInstance.id] = idleInstance.toProvisioning(username, role)
    }

    void instanceActive(Instance instance) {
        instanceById[instance.id] = instance.toActive()
    }

    List<Instance> allInstances() {
        return instanceById.values().toList()
    }

    Instance instanceStarted(String instanceId) {
        def instance = instanceById[instanceId]
        assert instance, "No instance with id $instanceId: ${allInstances()}"
        // TODO: Handle startup of instances in other roles
        if (instance.role == Instance.Role.TASK_EXECUTOR) {
            def provisioningInstance = instance.toProvisioning()
            instanceById[instanceId] = provisioningInstance
            eventDispatcher.publish(new TaskExecutorStarted(instance: provisioningInstance))
        }
        return instance
    }


    void release(String instanceId) {
        instanceById[instanceId] = instanceById[instanceId].toIdle()
    }

    Instance launchedOne() {
        assert allInstances().size() == 1,
                "Expected one instance to be launched. Actually launched ${allInstances().size()}: ${allInstances()}"
        return allInstances().first()
    }

    List<Instance> launched(int count) {
        assert allInstances().size() == count,
                "Expected $count instances to be launched. Actually launched ${allInstances().size()}: ${allInstances()}"
        return allInstances()
    }
}
