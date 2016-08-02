package org.openforis.sepal.component.workersession.api

import groovy.transform.stc.ClosureParams
import groovy.transform.stc.SimpleType

import java.util.concurrent.TimeUnit

interface InstanceManager {
    WorkerInstance requestInstance(WorkerSession session)

    void releaseInstance(String instanceId)

    void releaseUnusedInstances(List<WorkerSession> pendingOrActiveSessions, int minAge, TimeUnit timeUnit)

    List<InstanceType> getInstanceTypes()

    void onInstanceActivated(
            @ClosureParams(
                    value = SimpleType,
                    options = ['org.openforis.sepal.component.workersession.api.WorkerInstance'])
                    Closure listener
    )

    void onFailedToProvisionInstance(
            @ClosureParams(
                    value = SimpleType,
                    options = ['org.openforis.sepal.component.workersession.api.WorkerInstance'])
                    Closure listener)
}