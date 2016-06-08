package org.openforis.sepal.component.sandboxwebproxy.api

interface SandboxSessionManager {

    SandboxSession requestSession(String username)

    void heartbeat(String sessionId, String username)

    List<SandboxSession> findActiveSessions(String username)

    void onSessionClosed(Closure listener)
}
