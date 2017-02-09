package org.openforis.sepal.sshgateway

import groovyx.net.http.RESTClient
import org.openforis.sepal.security.Roles
import org.openforis.sepal.user.User
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON

class SepalClient {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final int WAIT_TIME = 5 * 1000
    private final String username
    private final String sepalEndpoint

    SepalClient(String username, String sepalEndpoint, String password) {
        this.sepalEndpoint = sepalEndpoint
        LOG.debug("Creating Sepal Client for $username at $sepalEndpoint")
        this.username = username
        sepal.auth.basic 'sepalAdmin', password
        sepal.headers['sepal-user'] = new User(username: username, roles: [Roles.ADMIN]).jsonString()
    }

    Map loadSandboxInfo() {
        LOG.debug("Loading sandbox info for $username")
        sepal.get(
                path: "sandbox/$username/report",
                contentType: JSON,
                requestContentType: JSON
        ).data
    }

    Map createSession(Map instanceType, Closure waitingCallback = {}) {
        LOG.info("Creating session on instance of type $instanceType")
        def session = sepal.post(path: instanceType.path, contentType: JSON).data
        joinSession(session, waitingCallback)
    }

    Map joinSession(Map session, Closure waitingCallback = {}) {
        LOG.debug("Waiting for session to become active: $session")
        while (!Thread.interrupted() && session.status == 'STARTING') {
            Thread.sleep(WAIT_TIME)
            waitingCallback.call()
            session = sepal.post(path: session.path, contentType: JSON).data
        }
        LOG.info("Jointing session $session")
        sepal.post(path: session.path, contentType: JSON).data
    }

    void terminate(Map session) {
        LOG.info("Terminating session $session")
        sepal.delete(path: session.path)
    }

    RESTClient getSepal() {
        new RESTClient(sepalEndpoint)
    }
}
