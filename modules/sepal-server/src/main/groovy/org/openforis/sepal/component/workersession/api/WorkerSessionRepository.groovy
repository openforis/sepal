package org.openforis.sepal.component.workersession.api

interface WorkerSessionRepository {
    void insert(WorkerSession session)

    void update(WorkerSession session)

    WorkerSession getSession(String sessionId)

    List<WorkerSession> userSessions(String username, List<WorkerSession.State> states)

    List<WorkerSession> userSessions(String username, List<WorkerSession.State> states, String instanceType)

    List<WorkerSession> pendingOrActiveSessions()

    WorkerSession pendingSessionOnInstance(String instanceId)

    List<WorkerSession> timedOutSessions()

}
