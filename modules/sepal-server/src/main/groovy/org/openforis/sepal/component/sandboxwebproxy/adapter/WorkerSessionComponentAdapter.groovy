package org.openforis.sepal.component.sandboxwebproxy.adapter

import org.openforis.sepal.component.Component
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSession
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSessionManager

class WorkerSessionComponentAdapter implements SandboxSessionManager {
    private final Component component

    WorkerSessionComponentAdapter(Component component) {
        this.component = component
    }

    SandboxSession requestSession(String username) {
        return null
    }

    void heartbeat(String sessionId, String username) {

    }

    List<SandboxSession> findActiveSessions(String username) {
        /*
            sandboxSessionManager.submit(
                    new LoadSandboxInfo(username: username)
            ).activeSessions*/
        return null
    }

    void onSessionClosed(Closure listener) {

    }
}
