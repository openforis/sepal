package org.openforis.sepal.component.workersession.adapter

import org.openforis.sepal.component.Component
import org.openforis.sepal.component.workerinstance.api.WorkerReservation
import org.openforis.sepal.component.workerinstance.command.ReleaseInstance
import org.openforis.sepal.component.workerinstance.command.ReleaseUnusedInstances
import org.openforis.sepal.component.workerinstance.command.RequestInstance
import org.openforis.sepal.component.workerinstance.event.FailedToProvisionInstance
import org.openforis.sepal.component.workerinstance.event.InstanceProvisioned
import org.openforis.sepal.component.workerinstance.query.FindMissingInstances
import org.openforis.sepal.component.workersession.api.InstanceManager
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workersession.api.WorkerInstance
import org.openforis.sepal.component.workersession.api.WorkerSession

import java.util.concurrent.TimeUnit

class InstanceComponentAdapter implements InstanceManager {
    final List<InstanceType> instanceTypes
    private final Component instanceComponent

    InstanceComponentAdapter(List<InstanceType> instanceTypes, Component instanceComponent) {
        this.instanceTypes = instanceTypes
        this.instanceComponent = instanceComponent
    }

    WorkerInstance requestInstance(WorkerSession session) {
        def instance = instanceComponent.submit(new RequestInstance(
                workerType: session.workerType,
                instanceType: session.instanceType,
                username: session.username
        ))
        return new WorkerInstance(id: instance.id, host: instance.host)
    }

    void releaseInstance(String instanceId) {
        instanceComponent.submit(new ReleaseInstance(instanceId: instanceId))
    }

    void releaseUnusedInstances(List<WorkerSession> pendingOrActiveSessions, int minAge, TimeUnit timeUnit) {
        instanceComponent.submit(new ReleaseUnusedInstances(
                usedInstanceIds: pendingOrActiveSessions.collect { it.instance.id },
                minAge: minAge,
                timeUnit: timeUnit
        ))
    }

    List<WorkerSession> sessionsWithoutInstance(List<WorkerSession> workerSessions) {
        def instances = workerSessions.findAll { it.instance }.collect {
            new org.openforis.sepal.component.workerinstance.api.WorkerInstance(
                    id: it.instance.id,
                    type: it.instanceType,
                    host: it.instance.host,
                    reservation: new WorkerReservation(username: it.username, workerType: it.workerType),
            )
        }
        def missingInstanceIds = instanceComponent.submit(new FindMissingInstances(instances)).collect { it.id }.toSet()
        return workerSessions.findAll { it.instance.id in missingInstanceIds }
    }

    void onInstanceActivated(Closure listener) {
        instanceComponent.on(InstanceProvisioned) {
            listener(new WorkerInstance(id: it.instance.id, host: it.instance.host))
        }
    }

    void onFailedToProvisionInstance(Closure listener) {
        instanceComponent.on(FailedToProvisionInstance) {
            listener(new WorkerInstance(id: it.instance.id, host: it.instance.host))
        }
    }
}
