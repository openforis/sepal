package workerinstance

import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance

class FakeInstanceProvisioner implements InstanceProvisioner {
    private final List<WorkerInstance> provisioned = []

    void provisionInstance(WorkerInstance instance) {
        provisioned << instance
    }

    void undeploy(WorkerInstance instance) {
        provisioned.remove(instance)
    }

    void noneProvisioned() {
        assert provisioned.empty,
                "Expected no provisioned instances. Actually has ${provisioned.size()}: $provisioned"
    }

    WorkerInstance provisionedOne() {
        assert provisioned.size() == 1,
                "Expected one instance to have been provisioned. Actually provisioned ${provisioned.size()}: $provisioned"
        return provisioned.first()
    }
}
