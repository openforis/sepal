package task

import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.InstanceProvider
import org.openforis.sepal.component.task.event.TaskExecutorStarted
import org.openforis.sepal.event.EventDispatcher

class FakeInstanceProvider implements InstanceProvider {
    private final EventDispatcher eventDispatcher
    private final instanceById = [:] as Map<String, Instance>
    private final failureByMethod = [:] as Map<String, Closure>

    FakeInstanceProvider(EventDispatcher eventDispatcher) {
        this.eventDispatcher = eventDispatcher
    }

    Instance launchReserved(String username, Instance.Role role, String instanceType) {
        maybeFail('launchReserved')
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
        maybeFail('launchIdle')
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
        maybeFail('instanceProvisioning')
        assert idleInstance.role == Instance.Role.IDLE
        assert !idleInstance.username

        instanceById[idleInstance.id] = idleInstance.toProvisioning(username, role)
    }

    void instanceActive(Instance instance) {
        maybeFail('instanceActive')
        instanceById[instance.id] = instance.toActive()
    }

    List<Instance> allInstances() {
        maybeFail('allInstances')
        return instanceById.values().toList()
    }

    List<Instance> allTaskExecutors() {
        maybeFail('allTaskExecutors')
        return allInstances().findAll { it.role == Instance.Role.TASK_EXECUTOR }
    }

    Instance getInstance(String instanceId) {
        maybeFail('getInstance')
        def instance = instanceById[instanceId]
        assert instance, "No instance with id $instanceId: ${allInstances()}"
        return instance
    }

    void release(String instanceId) {
        maybeFail('instanceId')
        instanceById[instanceId] = instanceById[instanceId].toIdle()
    }


    Instance instanceStarted(String instanceId) {
        def instance = instanceById[instanceId]
        assert instance, "No instance with id $instanceId: ${allInstances()}"
        if (instance.role == Instance.Role.TASK_EXECUTOR) {
            def provisioningInstance = instance.toProvisioning()
            instanceById[instanceId] = provisioningInstance
            eventDispatcher.publish(new TaskExecutorStarted(instance: provisioningInstance))
        }
        return instance
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

    void fail(String method, Closure failure) {
        failureByMethod[method] = failure
    }

    private void maybeFail(String method) {
        def failure = failureByMethod[method]
        if (failure)
            failure.call()
    }
}
