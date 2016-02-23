package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.HttpServerExchange
import io.undertow.server.session.Session
import io.undertow.server.session.SessionListener
import io.undertow.server.session.SessionManager
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.command.JoinSession
import org.openforis.sepal.component.sandboxmanager.event.SessionClosed
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

class WebProxySessionMonitor extends AbstractSessionListener implements Runnable {
    private final static Logger LOG = LoggerFactory.getLogger(this)

    private final Map<String, SessionPlaceholder> placeholderBySessionId = new ConcurrentHashMap()
    private final ConcurrentHashMap<Long, List<String>> sessionIdsBySandboxSessionId = new ConcurrentHashMap()

    private final SandboxManagerComponent sandboxManagerComponent
    private final SessionManager sessionManager

    WebProxySessionMonitor(SandboxManagerComponent sandboxManagerComponent, SessionManager sessionManager) {
        sessionManager.registerSessionListener(this)
        sandboxManagerComponent.register(SessionClosed) { sandboxSessionClosed(it.session) }
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
        } catch (Exception e) {
            LOG.error("Failed to send heartbeats", e)
        }
    }

    void sessionCreated(Session session, HttpServerExchange exchange) {
        super.sessionCreated(session, exchange)
    }

    void sessionDestroyed(Session session, HttpServerExchange exchange, SessionListener.SessionDestroyedReason reason) {
        def placeholder = placeholderBySessionId.remove(session.id)
        if (placeholder)
            sessionIdsBySandboxSessionId[placeholder.sandboxSessionId]?.remove(session.id)
    }

    void sandboxSessionClosed(SandboxSession sandboxSession) {
        def sessionIds = sessionIdsBySandboxSessionId.remove(sandboxSession.id)
        sessionIds?.each { sessionId ->
            placeholderBySessionId.remove(sessionId)
            sessionManager.getSession(sessionId)?.removeAttribute(SandboxWebProxy.SANDBOX_SESSION_ID_KEY)
        }
    }

    def sandboxSessionBound(Session session, SandboxSession sandboxSession) {
        def existingList = sessionIdsBySandboxSessionId.putIfAbsent(sandboxSession.id, new CopyOnWriteArrayList([session.id]))
        if (existingList)
            existingList << session.id
        placeholderBySessionId[session.id] = new SessionPlaceholder(sandboxSession)
    }

    private void monitorSession(Session session, String sessionId) {
        def placeholder = placeholderBySessionId[sessionId]
        if (placeholder)
            sendHeartbeat(session, placeholder)
        else
            LOG.info("Session which doesn't contain sandbox session id attribute: sessionId: $sessionId")
    }

    private void sendHeartbeat(Session session, SessionPlaceholder sessionPlaceholder) {
        LOG.debug("Sending heartbeat for session id $sessionPlaceholder.sandboxSessionId")
        try {
            sandboxManagerComponent.submit(
                    new JoinSession(sessionId: sessionPlaceholder.sandboxSessionId, username: sessionPlaceholder.username)
            )
        } catch (Exception e) {
            session.removeAttribute(SandboxWebProxy.SANDBOX_SESSION_ID_KEY)
            throw e
        }
    }

    private static class SessionPlaceholder {
        final String username
        final long sandboxSessionId

        SessionPlaceholder(SandboxSession sandboxSession) {
            username = sandboxSession.username
            sandboxSessionId = sandboxSession.id
        }
    }
}
