package task

import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.InstanceProvisioner
import org.openforis.sepal.component.task.event.TaskExecutorProvisioned
import org.openforis.sepal.event.EventDispatcher

class FakeInstanceProvisioner implements InstanceProvisioner {
    private final EventDispatcher eventDispatcher
    private final Map<String, Instance> instanceById = [:]

    FakeInstanceProvisioner(EventDispatcher eventDispatcher) {
        this.eventDispatcher = eventDispatcher
    }

    void provision(Instance instance) {
        instanceById[instance.id] = instance
    }

    void reset(Instance instance) {
        instanceById.remove(instance.id)
    }

    Instance provisionedOne(Instance.Role role) {
        def provisionedInRole = allInstances().findAll { it.role == role }
        assert provisionedInRole.size() == 1, "Expected one instance of role $role to be provisioned. " +
                "Actually provisioned ${provisionedInRole.size()}: $provisionedInRole"
        return provisionedInRole.first()
    }

    void provisionedNone(Instance.Role role) {
        def provisionedInRole = allInstances().findAll { it.role == role }
        assert provisionedInRole.empty, "Expected no instance of role $role to be provisioned. " +
                "Actually provisioned ${provisionedInRole.size()}: $provisionedInRole"
    }

    Instance instanceProvisioned(String instanceId) {
        def instance = instanceById[instanceId]
        assert instance, "No instance with id $instanceId: ${allInstances()}"
        eventDispatcher.publish(new TaskExecutorProvisioned(instance))
        return instance
    }

    private List<Instance> allInstances() {
        instanceById.values().toList()
    }
}
