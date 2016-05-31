package org.openforis.sepal.component.workersession.adapter

import org.openforis.sepal.component.Component
import org.openforis.sepal.component.workerinstance.command.RequestInstance
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerInstance
import org.openforis.sepal.component.workersession.api.WorkerSession

class InstanceComponentAdapter implements InstanceManager {
    private final Component instanceComponent

    InstanceComponentAdapter(Component instanceComponent) {
        this.instanceComponent = instanceComponent
    }

    WorkerInstance requestInstance(WorkerSession session) {
        def instance = instanceComponent.submit(new RequestInstance(
                workerType: session.workerType,
                instanceType: session.instanceType
        ))
        return new WorkerInstance(instance.id, instance.host)
    }

    void releaseInstance(String instanceId) {

    }

    void releaseUnusedInstances(List<WorkerSession> pendingOrActiveSessions) {

    }

    void onInstanceActivated(Closure listener) {

    }
}
