package org.openforis.sepal.component.task.api

import groovy.transform.stc.ClosureParams
import groovy.transform.stc.SimpleType

interface WorkerSessionManager {
    WorkerSession requestSession(String username, String instanceType)

    WorkerSession findPendingOrActiveSession(String username, String instanceType)

    WorkerSession findSessionById(String sessionId)

    void closeSession(String sessionId)

    void heartbeat(String sessionId)

    WorkerSessionManager onSessionActivated(
            @ClosureParams(
                    value = SimpleType,
                    options = ['org.openforis.sepal.component.task.api.WorkerSession'])
                    Closure listener)

    WorkerSessionManager onSessionClosed(
            @ClosureParams(value = SimpleType, options = ['java.lang.String'])
                    Closure listener)

    String getDefaultInstanceType()
}