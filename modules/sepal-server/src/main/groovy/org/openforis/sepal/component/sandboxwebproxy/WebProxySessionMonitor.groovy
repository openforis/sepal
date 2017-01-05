package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.HttpServerExchange
import io.undertow.server.session.Session
import io.undertow.server.session.SessionListener
import io.undertow.server.session.SessionManager
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSession
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSessionManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

import static org.openforis.sepal.component.sandboxwebproxy.SandboxWebProxy.SANDBOX_SESSION_ID_KEY

class WebProxySessionMonitor extends AbstractSessionListener implements Runnable {
    private final static Logger LOG = LoggerFactory.getLogger(this)

    private final Map<String, SandboxSession> sandboxSessionByHttpSessionId = new ConcurrentHashMap()
    private final ConcurrentHashMap<String, List<String>> httpSessionIdsBySandboxSessionId = new ConcurrentHashMap()

    private final SandboxSessionManager sandboxSessionManager
    private final SessionManager httpSessionManager

    WebProxySessionMonitor(SandboxSessionManager sandboxSessionManager, SessionManager httpSessionManager) {
        httpSessionManager.registerSessionListener(this)
        sandboxSessionManager.onSessionClosed { sandboxSessionClosed(it) }
        this.sandboxSessionManager = sandboxSessionManager
        this.httpSessionManager = httpSessionManager
    }

    void run() {
        try {
            LOG.trace("Going to check alive sessions")
            def activeHttpSessionIds = httpSessionManager.allSessions.toSet()
            activeHttpSessionIds.each { String httpSessionId ->
                def httpSession = httpSessionManager.getSession(httpSessionId)
                if (httpSession != null)
                    sendWorkerSessionHeartbeat(httpSession)
            }
        } catch (Exception e) {
            LOG.error("Failed to send heartbeats", e)
        }
    }

    void sessionDestroyed(Session httpSession, HttpServerExchange exchange, SessionListener.SessionDestroyedReason reason) {
        def sandboxSession = sandboxSessionByHttpSessionId.remove(httpSession.id)
        if (sandboxSession)
            httpSessionIdsBySandboxSessionId[sandboxSession.id]?.remove(httpSession.id)
    }

    void sandboxSessionClosed(String sandboxSessionId) {
        def httpSessionIds = httpSessionIdsBySandboxSessionId.remove(sandboxSessionId)
        LOG.debug("Sandbox session closed ($sandboxSessionId). Removing all HTTP session attributes from $httpSessionIds")
        httpSessionIds?.each { httpSessionId ->
            sandboxSessionByHttpSessionId.remove(httpSessionId)
            def httpSession = httpSessionManager.getSession(httpSessionId)
            httpSession?.attributeNames?.each {
                httpSession?.removeAttribute(it)
            }
        }
    }

    def sandboxSessionBound(Session httpSession, SandboxSession sandboxSession) {
        def existingList = httpSessionIdsBySandboxSessionId.putIfAbsent(sandboxSession.id, new CopyOnWriteArrayList([httpSession.id]))
        if (existingList)
            existingList << httpSession.id
        sandboxSessionByHttpSessionId[httpSession.id] = sandboxSession
    }

    private void sendWorkerSessionHeartbeat(Session httpSession) {
        def sandboxSession = sandboxSessionByHttpSessionId[httpSession.id]
        if (sandboxSession)
            sendHeartbeat(httpSession, sandboxSession)
        else
            LOG.info("HTTP session which doesn't contain sandbox session id attribute: httpSessionId: $httpSession.id")
    }

    private void sendHeartbeat(Session session, SandboxSession sandboxSession) {
        LOG.debug("Sending heartbeat for session id $sandboxSession.id")
        try {
            sandboxSessionManager.heartbeat(sandboxSession.id, sandboxSession.username)
        } catch (Exception e) {
            session.removeAttribute(SANDBOX_SESSION_ID_KEY)
            throw e
        }
    }
}
