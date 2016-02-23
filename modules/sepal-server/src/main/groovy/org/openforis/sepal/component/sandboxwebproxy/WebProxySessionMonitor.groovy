package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.session.Session
import io.undertow.server.session.SessionManager
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxmanager.command.JoinSession
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.ConcurrentHashMap

class WebProxySessionMonitor implements Runnable {
    private final static Logger LOG = LoggerFactory.getLogger(this)
    private final Map<String, SessionPlaceholder> placeholderBySessionId = new ConcurrentHashMap<>()

    private final SandboxManagerComponent sandboxManagerComponent
    private final SessionManager sessionManager

    WebProxySessionMonitor(SandboxManagerComponent sandboxManagerComponent, SessionManager sessionManager) {
        this.sandboxManagerComponent = sandboxManagerComponent
        this.sessionManager = sessionManager
    }

    void run() {
        try {
            LOG.trace("Going to check alive sessions")
            def activeSessionIds = sessionManager.allSessions.toSet()
            activeSessionIds.each { String sessionId ->
                def session = sessionManager.getSession(sessionId)
                if (session != null)
                    monitorSession(session, sessionId)
            }
            removePlaceholdersForClosedSessions(activeSessionIds)
        } catch (Exception e) {
            LOG.error("Failed to send heartbeats", e)
        }
    }

    private boolean removePlaceholdersForClosedSessions(activeSessionIds) {
        placeholderBySessionId.keySet().removeAll { !activeSessionIds.contains(it) }
    }

    private void monitorSession(Session session, String sessionId) {
        def placeholder = placeholderBySessionId[sessionId]
        if (!placeholder) {
            placeholder = new SessionPlaceholder(SandboxWebProxy.username(session), SandboxWebProxy.sandboxSessionId(session))
            placeholderBySessionId[sessionId] = placeholder
        }
        a
        if (placeholder.sandboxSessionId) {
            LOG.debug("Sending heartbeat for session id $placeholder.sandboxSessionId")
            sendHeartbeat(session, placeholder)
        } else
            LOG.info("Session which doesn't contain sandbox session id attribute: sessionId: $sessionId")
    }

    private void sendHeartbeat(Session session, SessionPlaceholder sessionPlaceholder) {
        try {
            sandboxManagerComponent.submit(
                    new JoinSession(sessionId: sessionPlaceholder.sandboxSessionId, username: sessionPlaceholder.username)
            )
        } catch (Exception e) {
            session.removeAttribute(SandboxWebProxy.SANDBOX_ID_KEY)
            throw e
        }
    }

    private static class SessionPlaceholder {
        final String username
        final long sandboxSessionId

        SessionPlaceholder(String username, long sandboxSessionId) {
            this.username = username
            this.sandboxSessionId = sandboxSessionId
        }
    }
}
