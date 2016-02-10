package org.openforis.sepal.hostingservice.vagrant

import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.WorkerInstanceProvider
import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceType

class VagrantWorkerInstanceProvider implements WorkerInstanceProvider {
    final List<WorkerInstanceType> instanceTypes = [new WorkerInstanceType(id: 'vagrant-box', name: 'Vagrant Box')]

    private final WorkerInstance instance = new WorkerInstance(
            id: 'vagrant',
            host: '172.17.0.1',
            type: instanceTypes.first().id
    )

    List<WorkerInstance> idleInstances(String instanceType) {
        return [instance]
    }

    Map<String, Integer> idleCountByType() {
        return [(instanceTypes.first().id): 1]
    }

    WorkerInstance launch(String instanceType) {
        return instance
    }

    void reserve(String instanceId, SandboxSession session) { /* no-op*/ }

    void idle(String instanceId) { /* no-op*/ }

    boolean terminate(String instanceId) { false }
}
