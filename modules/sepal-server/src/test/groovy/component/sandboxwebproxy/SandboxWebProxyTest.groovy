package component.sandboxwebproxy

import fake.server.TestServer
import groovymvc.RequestContext
import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.RESTClient
import org.apache.http.impl.client.BasicCookieStore
import org.openforis.sepal.component.sandboxwebproxy.SandboxWebProxy
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSession
import org.openforis.sepal.component.sandboxwebproxy.api.SandboxSessionManager
import spock.lang.Specification
import util.Port

import java.util.concurrent.ConcurrentHashMap

import static groovy.json.JsonOutput.toJson

class SandboxWebProxyTest extends Specification {
    final port = Port.findFree()
    final endpoint = new Endpoint()
    final portByEndpoint = [endpoint: endpoint.port]
    final sandboxSessionManager = new FakeSandboxSessionManager()
    final sessionHeartbeatInterval = 30
    final sessionTimeout = 900
    final proxy = new SandboxWebProxy(port, portByEndpoint, sandboxSessionManager, sessionHeartbeatInterval, sessionTimeout)

    def cookieStores = new ConcurrentHashMap<String, BasicCookieStore>()
    final client = new RESTClient("http://localhost:$port/")

    def setup() {
        client.handler.failure = { resp -> return resp }
        proxy.start()
    }

    def cleanup() {
        proxy.stop()
        endpoint.stop()
    }

    def 'Given a started endpoint, when requesting endpoint, proxy response match endpoint response'() {
        start('endpoint')

        when:
        def proxyResponse = get('endpoint/')

        then:
        this.endpoint.responseMatch(proxyResponse)
    }

    def 'Given an endpoint not started, when requesting endpoint, 400 is returned'() {
        when:
        def response = get('endpoint/')

        then:
        response.status == 400
    }

    def 'Given a started endpoint, when requesting another endpoint, 400 is returned'() {
        start('another-endpoint')

        when:
        def response = get('endpoint/')

        then:
        response.status == 400
    }

    def 'Given no previous endpoint, when starting endpoint, sandbox session is requested'() {
        when:
        start('endpoint')

        then:
        requestedSandboxSessions(1)
    }

    def 'Given a started endpoint, when starting again, no additional sandbox session is requested'() {
        start('endpoint')

        when:
        start('endpoint')

        then:
        requestedSandboxSessions(1)
    }

    def 'Given a started endpoint, when starting another endpoint, no additional sandbox session is requested'() {
        start('endpoint')

        when:
        start('another-endpoint')

        then:
        requestedSandboxSessions(1)
    }

    def 'Given a started endpoint, when another user start an endpoint, additional sandbox session is requested'() {
        start('endpoint', 'some-user')

        when:
        start('endpoint', 'another-user')

        then:
        requestedSandboxSessions(2)
    }

    def 'When requesting non-existing endpoint , 404 is returned'() {
        when:
        def response = get('non-existing/')

        then:
        response.status == 404
    }

    def 'When making request without specifying endpoint , 404 is returned'() {
        when:
        def response = get('')

        then:
        response.status == 404
    }

    def 'When making request without sepal-user header, 400 is returned'() {
        when:
        def response = get('endpoint/', [:])

        then:
        response.status == 400
    }

    def 'When making request with sepal-user header but missing username, 400 is returned'() {
        when:
        def response = get('endpoint/', ['sepal-user': toJson([:])])

        then:
        response.status == 400
    }


    private void requestedSandboxSessions(int count) {
        sandboxSessionManager.requestedSessions(count)
    }

    private HttpResponseDecorator get(String path, String username = 'some-username') {
        get(path, ['sepal-user': toJson([username: username])])
    }

    private HttpResponseDecorator get(String path, Map<String, String> headers) {
        initCookieStore(headers)
        client.get(path: path, headers: headers) as HttpResponseDecorator
    }

    private void start(String endpoint, String username = 'some-username') {
        def headers = ['sepal-user': toJson([username: username])]
        initCookieStore(headers)
        client.post(
                path: 'start',
                query: ['endpoint': endpoint],
                headers: headers)
    }

    private void initCookieStore(Map<String, String> headers) {
        def usernameHeader = headers['sepal-user']
        if (usernameHeader)
            client.client.cookieStore = cookieStores.computeIfAbsent(usernameHeader) {
                new BasicCookieStore()
            }
    }
}

class Endpoint {
    private final server = new TestServer().start()
    private final List<RequestContext> invocations = []
    final String data = 'Endpoint data'
    final int status = 200


    Endpoint() {
        server.get {
            invocations << it
            response.contentType = 'text/plain'
            send data
        }
    }

    int getPort() {
        server.port
    }

    void stop() {
        server.stop()
    }

    boolean isInvoked() {
        invocations
    }

    void responseMatch(HttpResponseDecorator response) {
        assert response.status == status
        assert response.data.text == data
        assert invoked
    }
}

class FakeSandboxSessionManager implements SandboxSessionManager {
    private final List<Closure> listeners = []
    private int requestedSessions
    private Map<String, SandboxSession> sessionsById = [:]

    SandboxSession requestSession(String username) {
        requestedSessions++
        def session = new SandboxSession(
                id: UUID.randomUUID() as String,
                username: username,
                host: 'localhost',
                active: true,
                closed: false)
        sessionsById[session.id] = session
        return session
    }

    SandboxSession heartbeat(String sessionId, String username) {
        return null
    }

    SandboxSession findSession(String sessionId) {
        return sessionsById[sessionId]
    }

    List<SandboxSession> findPendingOrActiveSessions(String username) {
        return []
    }

    void onSessionClosed(Closure listener) {
        listeners << listener
    }

    void requestedSessions(int count) {
        assert requestedSessions == count
    }
}