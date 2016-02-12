package org.openforis.sepal.sshgateway

import groovyx.net.http.RESTClient
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class SepalClient {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final int WAIT_TIME = 5 * 1000
    private final String username
    private final RESTClient sepal

    SepalClient(String username, String sepalEndpoint) {
        LOG.debug("Creating Sepal Client for $username at $sepalEndpoint")
        this.username = username
        this.sepal = new RESTClient(sepalEndpoint)
    }

    Map loadSandboxInfo() {
        LOG.debug("Loading sandbox info for $username")
        sepal.get(path: "sandbox/$username").data
    }

    Map createSession(Map instanceType, Closure waitingCallback = {}) {
        LOG.info("Creating session on instance of type $instanceType")
        def session = sepal.post(path: instanceType.path).data
        joinSession(session, waitingCallback)
    }

    Map joinSession(Map session, Closure waitingCallback = {}) {
        LOG.debug("Waiting for session to become active: $session")
        while (!Thread.interrupted() && session.status == 'STARTING') {
            sepal.post(path: session.alivePath)
            Thread.sleep(WAIT_TIME)
            waitingCallback.call()
            session = sepal.get(path: session.path).data
        }
        LOG.info("Jointing session $session")
        sepal.post(path: session.path).data
    }

    void terminate(Map session) {
        LOG.info("Terminating session $session")
        sepal.delete(path: session.path)
    }
}
