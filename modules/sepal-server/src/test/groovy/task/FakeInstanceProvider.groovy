package task

import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.InstanceProvider

class FakeInstanceProvider implements InstanceProvider {
    def instanceById = [:] as Map<String, Instance>

    Instance launchReserved(String username, Instance.Role role, String instanceType) {
        def instance = new Instance(
                id: UUID.randomUUID().toString(),
                type: instanceType,
                host: UUID.randomUUID().toString(),
                username: username,
                role: role,
                state: Instance.State.STARTING,
                idle: false
        )
        instanceById[instance.id] = instance
        return instance
    }

    Instance launchIdle(String instanceType) {
        def instance = new Instance(
                id: UUID.randomUUID().toString(),
                type: instanceType,
                host: UUID.randomUUID().toString(),
                idle: true
        )
        instanceById[instance.id] = instance
        return instance
    }

    void reserve(Instance idleInstance, String username, Instance.Role role, Instance.State state) {
        assert idleInstance.idle
        assert !idleInstance.username
        assert !idleInstance.role

        instanceById[idleInstance.id] = idleInstance.toReserved(username, role, state)
    }

    List<Instance> allInstances() {
        return instanceById.values().toList()
    }

    void release(String instanceId) {
        instanceById[instanceId] = instanceById[instanceId].toIdle()
    }

    Instance launchedOne() {
        assert allInstances().size() == 1,
                "Expected one instance to be launched. Actually launched ${allInstances().size()}"
        return allInstances().first()
    }
}
