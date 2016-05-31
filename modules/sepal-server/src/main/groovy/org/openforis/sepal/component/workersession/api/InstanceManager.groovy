package org.openforis.sepal.component.workersession.api

import java.util.concurrent.TimeUnit

interface InstanceManager {
    WorkerInstance requestInstance(WorkerSession session)

    void releaseInstance(String instanceId)

    void releaseUnusedInstances(List<WorkerSession> pendingOrActiveSessions, int minAge, TimeUnit timeUnit)

    void onInstanceActivated(Closure listener)
}