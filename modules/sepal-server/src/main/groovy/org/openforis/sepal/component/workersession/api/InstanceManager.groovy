package org.openforis.sepal.component.workersession.api

interface InstanceManager {
    WorkerInstance requestInstance(WorkerSession session)

    void release(String instanceId)

    void onInstanceActivated(Closure listener)

    void releaseUnused(List<WorkerSession> pendingOrActiveSessions)
}