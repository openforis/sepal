package org.openforis.sepal.component.task.api

interface WorkerSessionManager {
    WorkerSession requestSession(String username, String instanceType)

    WorkerSession findOrRequestSession(String username, String instanceType)

    WorkerSession findSession(String sessionId)

    void closeSession(String sessionId)

    void heartbeat(String sessionId)

    void onSessionActivated(Closure listener)

    void onSessionClosed(Closure listener)
}