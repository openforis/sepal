package org.openforis.sepal.component.task.api

interface WorkerSessionManager {
    WorkerSession requestSession(String username, String instanceType)

    WorkerSession findPendingOrActiveSession(String username, String instanceType)

    WorkerSession findSessionById(String sessionId)

    void closeSession(String sessionId)

    void heartbeat(String sessionId)

    void onSessionActivated(Closure listener)
}