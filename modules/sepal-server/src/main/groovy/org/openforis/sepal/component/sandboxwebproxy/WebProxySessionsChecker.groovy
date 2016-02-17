package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.session.SessionManager
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxmanager.command.JoinSession
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class WebProxySessionsChecker implements Runnable {
    private final static Logger LOG = LoggerFactory.getLogger(this)

    private final SandboxManagerComponent sandboxManagerComponent
    private final SessionManager sessionManager
    private final String sandboxIdSessionAttrName

    WebProxySessionsChecker(SandboxManagerComponent sandboxManagerComponent, SessionManager sessionManager, String sandboxIdSessionAttrName) {
        this.sandboxManagerComponent = sandboxManagerComponent
        this.sessionManager = sessionManager
        this.sandboxIdSessionAttrName = sandboxIdSessionAttrName
    }

    @Override
    void run() {
        try {
            LOG.trace("Going to check alive sessions")
            sessionManager.allSessions.each { String sessionId ->
                def session = sessionManager.getSession(sessionId)
                int sandboxSessionId = session.getAttribute(sandboxIdSessionAttrName) as int
                if (sandboxSessionId) {
                    LOG.info("Going to send alive signal for  $sandboxSessionId")
                    sendHeartbeat(sandboxSessionId, session.getAttribute('sepal-user') as String)
                } else {
                    LOG.warn("Found an active session which doesn't contain $sandboxIdSessionAttrName attribute")
                }
            }
        } catch (Exception e) {
            LOG.error("Failed to send heartbeat", e)
        }
    }

    private void sendHeartbeat(long sandboxSessionId, String username) {
        sandboxManagerComponent.submit(
                new JoinSession(sessionId: sandboxSessionId, username: username)
        )
    }
}
