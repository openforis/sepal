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

import static groovy.json.JsonOutput.toJson

class SandboxWebProxyTest extends Specification {
    final port = Port.findFree()
    final endpoint = new Endpoint()
    final portByEndpoint = [endpoint: endpoint.port]
    final sandboxSessionManager = new FakeSandboxSessionManager()
    final sessionHeartbeatInterval = 30
    final sessionTimeout = 900
    final proxy = new SandboxWebProxy(port, portByEndpoint, sandboxSessionManager, sessionHeartbeatInterval, sessionTimeout)

    def cookieStore = new BasicCookieStore()
    final client = new RESTClient("http://localhost:$port/")

    def setup() {
        client.handler.failure = { resp -> return resp }
        client.client.cookieStore = cookieStore
        proxy.start()
    }

    def cleanup() {
        proxy.stop()
        endpoint.stop()
    }

    def 'When requesting endpoint, proxy response match endpoint response'() {
        when:
        def proxyResponse = get('endpoint/')

        then:
        endpoint.responseMatch(proxyResponse)
    }

    def 'Given no previous request, when requesting endpoint, sandbox session is requested'() {
        when:
        get('endpoint/')

        then:
        requestedSandboxSessions(1)
    }

    def 'Given a previous request from same user, when requesting endpoint, no additional sandbox session is requested'() {
        get('endpoint/')

        when:
        get('endpoint/')

        then:
        requestedSandboxSessions(1)
    }

    def 'Given a previous request from same different, when requesting endpoint, additional sandbox session is requested'() {
        get('endpoint/', 'some-user')

        when:
        get('endpoint/', 'another-user')

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

    private HttpResponseDecorator get(String path, Map<String, Object> headers) {
        client.get(path: path, headers: headers) as HttpResponseDecorator
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

    SandboxSession requestSession(String username) {
        requestedSessions++
        return new SandboxSession(
                id: UUID.randomUUID() as String,
                username: username,
                host: 'localhost',
                active: true,
                closed: false)
    }

    SandboxSession heartbeat(String sessionId, String username) {
        return null
    }

    List<SandboxSession> findActiveSessions(String username) {
        return []
    }

    void onSessionClosed(Closure listener) {
        listeners << listener
    }

    void requestedSessions(int count) {
        assert requestedSessions == count
    }
}