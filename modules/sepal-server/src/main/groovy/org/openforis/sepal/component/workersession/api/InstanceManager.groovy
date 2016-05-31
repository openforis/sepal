package org.openforis.sepal.component.workersession.api

interface InstanceManager {
    WorkerInstance requestInstance(WorkerSession session)

    void releaseInstance(String instanceId)

    void releaseUnusedInstances(List<WorkerSession> pendingOrActiveSessions)

    void onInstanceActivated(Closure listener)
}