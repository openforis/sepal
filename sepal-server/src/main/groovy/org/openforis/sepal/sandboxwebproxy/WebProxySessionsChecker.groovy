package org.openforis.sepal.sandboxwebproxy

import io.undertow.server.session.SessionManager
import org.openforis.sepal.sandbox.SandboxManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory


class WebProxySessionsChecker implements Runnable{

    private final static Logger LOG = LoggerFactory.getLogger(this)

    private final SessionManager sessionManager
    private final SandboxManager sandboxManager
    private final String sandboxIdSessionAttrName

    WebProxySessionsChecker(SandboxManager sandboxManager, SessionManager sessionManager, String sandboxIdSessionAttrName){
        this.sessionManager = sessionManager
        this.sandboxManager = sandboxManager
        this.sandboxIdSessionAttrName = sandboxIdSessionAttrName
    }

    @Override
    void run() {
        LOG.trace("Going to check alive sessions")
        sessionManager.activeSessions.each { String sessionId ->
            def session = sessionManager.getSession(sessionId)
            int sandboxId = session.getAttribute(sandboxIdSessionAttrName) as int
            if (sandboxId){
                LOG.info("Going to send alive signal for  $sandboxId")
                sandboxManager.aliveSignal(sandboxId)
            }else{
                LOG.warn("Found an active session which doesn't contain $sandboxIdSessionAttrName attribute")
            }
        }
    }
}
