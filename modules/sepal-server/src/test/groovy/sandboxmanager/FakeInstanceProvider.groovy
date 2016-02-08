package sandboxmanager

import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceProvider
import org.openforis.sepal.hostingservice.WorkerInstanceType

import static org.openforis.sepal.hostingservice.Status.ACTIVE
import static org.openforis.sepal.hostingservice.Status.STARTING


class FakeInstanceProvider implements WorkerInstanceProvider {
    List<WorkerInstance> allocated = []
    String useId
    int terminationRequests = 0
    boolean slowStartup
    List<WorkerInstanceType> instanceTypes = [new WorkerInstanceType(id: 'an-instance-type', hourlyCost: 1)]

    WorkerInstance allocate(String instanceType) {
        if (useId && allocated)
            return allocated.first()
        def instance = new WorkerInstance(
                id: useId ?: UUID.randomUUID().toString(),
                type: instanceType,
                host: UUID.randomUUID().toString(),
                state: slowStartup ? STARTING : ACTIVE)
        allocated << instance
        return instance
    }

    boolean terminate(String instanceId) {
        terminationRequests++
        allocated.removeIf { it.id == instanceId }
        return true
    }

    WorkerInstance allocatedOne() {
        assert allocated.size() == 1
        return allocated.first()
    }

    void nonAllocated() {
        assert allocated.empty
    }

    def useId(String instanceId) {
        useId = instanceId
    }

    def slowStartup() {
        slowStartup = true
    }

    void addType(WorkerInstanceType instanceType) {
        if (!instanceTypes.find { it.id == instanceType.id })
            instanceTypes << instanceType
    }
}
