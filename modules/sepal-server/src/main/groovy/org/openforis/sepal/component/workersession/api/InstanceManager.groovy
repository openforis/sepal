package org.openforis.sepal.component.workersession.api

import java.util.concurrent.TimeUnit

interface InstanceManager {
    WorkerInstance requestInstance(WorkerSession session)

    void releaseInstance(String instanceId)

    void releaseUnusedInstances(List<WorkerSession> pendingOrActiveSessions, int minAge, TimeUnit timeUnit)

    List<InstanceType> getInstanceTypes()

    void onInstanceActivated(Closure listener)
}