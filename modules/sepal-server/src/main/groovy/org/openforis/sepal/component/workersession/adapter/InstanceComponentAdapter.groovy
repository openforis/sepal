package org.openforis.sepal.component.workersession.adapter

import org.openforis.sepal.component.Component
import org.openforis.sepal.component.workerinstance.command.ReleaseInstance
import org.openforis.sepal.component.workerinstance.command.ReleaseUnusedInstances
import org.openforis.sepal.component.workerinstance.command.RequestInstance
import org.openforis.sepal.component.workerinstance.event.InstanceProvisioned
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.workersession.api.WorkerInstance
import org.openforis.sepal.component.workersession.api.WorkerSession

import java.util.concurrent.TimeUnit

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
        instanceComponent.submit(new ReleaseInstance(instanceId: instanceId))
    }

    void releaseUnusedInstances(List<WorkerSession> pendingOrActiveSessions, int minAge, TimeUnit timeUnit) {
        instanceComponent.submit(new ReleaseUnusedInstances(
                usedInstanceIds: pendingOrActiveSessions.collect { it.id },
                minAge: minAge,
                timeUnit: timeUnit
        ))
    }

    void onInstanceActivated(Closure listener) {
        instanceComponent.on(InstanceProvisioned) {
            listener(new WorkerInstance(it.instance.id, it.instance.host))
        }
    }
}
