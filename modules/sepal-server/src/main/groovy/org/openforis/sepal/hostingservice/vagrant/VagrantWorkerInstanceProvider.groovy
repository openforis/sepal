package org.openforis.sepal.hostingservice.vagrant

import org.openforis.sepal.hostingservice.WorkerInstance
import org.openforis.sepal.hostingservice.WorkerInstanceProvider
import org.openforis.sepal.hostingservice.WorkerInstanceType

import static org.openforis.sepal.hostingservice.Status.ACTIVE

class VagrantWorkerInstanceProvider implements WorkerInstanceProvider {
    final List<WorkerInstanceType> instanceTypes = [new WorkerInstanceType(id: 'vagrant-box', name: 'Vagrant Box')]

    WorkerInstance allocate(String instanceType) {
        return new WorkerInstance(
                id: 'vagrant',
                host: '172.17.0.1',
                type: instanceTypes.first().id,
                state: ACTIVE
        )
    }

    boolean terminate(String instanceId) { return false }
}
