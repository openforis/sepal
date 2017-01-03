package org.openforis.sepal.component.sandboxwebproxy.api

interface SandboxSessionManager {

    SandboxSession requestSession(String username)

    SandboxSession heartbeat(String sessionId, String username)

    SandboxSession findSession(String sessionId)

    List<SandboxSession> findPendingOrActiveSessions(String username)

    void onSessionClosed(Closure listener)
}
