package component.workerinstance

import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance

class FakeInstanceProvisioner implements InstanceProvisioner {
    private final List<WorkerInstance> provisioned = []
    private boolean failing

    void provisionInstance(WorkerInstance instance) {
        if (failing)
            throw new IllegalStateException("Instance provider failed to provision instance")
        provisioned << instance
    }

    void undeploy(WorkerInstance instance) {
        if (failing)
            throw new IllegalStateException("Instance provider failed to undeploy instance")
        provisioned.remove(instance)
    }

    void provisionedNone() {
        assert provisioned.empty,
                "Expected no provisioned instances. Actually has ${provisioned.size()}: $provisioned"
    }

    WorkerInstance provisionedOne() {
        assert provisioned.size() == 1,
                "Expected one instance to have been provisioned. Actually provisioned ${provisioned.size()}: $provisioned"
        return provisioned.first()
    }

    void fail() {
        failing = true
    }

}
