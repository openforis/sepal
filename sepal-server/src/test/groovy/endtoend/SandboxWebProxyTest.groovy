package endtoend

import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.RESTClient
import io.undertow.Undertow
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import org.openforis.sepal.sandboxwebproxy.SandboxWebProxy
import org.openforis.sepal.session.SepalSessionManager
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.session.model.UserSessions
import org.openforis.sepal.user.NonExistingUser
import spock.lang.Ignore
import spock.lang.Specification
import spock.util.concurrent.PollingConditions
import util.Port

@Ignore
class SandboxWebProxyTest extends Specification {
    StubSandboxManager sandboxManager = Spy(StubSandboxManager)
    RESTClient client
    SandboxWebProxy proxy
    def endpoint1 = new Endpoint()
    def endpoint2 = new Endpoint()
    def user = existingUser('some-user')
    def anotherUser = existingUser('another-user')
    def alive = false

    def setup() {
        def port = Port.findFree()
        proxy = new SandboxWebProxy(
                port,
                [endpoint1: endpoint1.port, endpoint2: endpoint2.port],
                sandboxManager,
                1
        )
        proxy.start()
        client = new RESTClient("http://localhost:$port/")
        client.handler.failure = { response, body -> response }
    }

    def cleanup() {
        proxy.stop()
        endpoint1.stop()
        endpoint2.stop()
    }

    def 'Session alive notifications works as expected'() {
        when:
            get(endpoint: 'endpoint1', user: user)
        then:
            new PollingConditions().eventually {
                sandboxManager.aliveInvoked
            }
    }

    def 'Proxies an endpoint'() {
        when:
            def response = get(endpoint: 'endpoint1', user: user)

        then:
            response.status == 200
            endpoint1.invoked
            !endpoint2.invoked
    }

    def 'Proxied endpoint can be invoked multiple times, without obtaining sandbox more than once'() {
        when:
            get(endpoint: 'endpoint1', user: user)
            get(endpoint: 'endpoint1', user: user)

        then:
            endpoint1.invoked.size() == 2
            1 * sandboxManager.getUserSandbox(user) >> sandbox
    }

    def 'Multiple proxied endpoint can be invoked, without obtaining sandbox more than once'() {
        when:
            get(endpoint: 'endpoint1', user: user)
            get(endpoint: 'endpoint2', user: user)

        then:
            endpoint1.invoked.size() == 1
            endpoint2.invoked.size() == 1
            1 * sandboxManager.getUserSandbox(user) >> sandbox
    }

    def 'Multiple users can invoke the same endpoint, each obtaining its own sandbox'() {
        when:
            get(endpoint: 'endpoint1', user: user)
            get(endpoint: 'endpoint1', user: anotherUser)

        then:
            endpoint1.invoked.size() == 2
            1 * sandboxManager.getUserSandbox(user) >> sandbox
            1 * sandboxManager.getUserSandbox(anotherUser) >> sandbox
    }

    def 'Returns 400 when endpoint is unspecified'() {
        when:
            def response = get(endpoint: null, user: user)

        then:
            response.status == 400
    }

    def 'Returns 400 when endpoint is invalid'() {
        when:
            def response = get(endpoint: 'invalid', user: user)

        then:
            response.status == 400
    }

    def 'Returns 400 when user is unspecified'() {
        when:
            def response = get(endpoint: 'endpoint1', user: null)

        then:
            response.status == 400
    }

    def 'Returns 400 when user is non-existing'() {
        when:
            def response = get(endpoint: 'endpoint1', user: 'non-existing')

        then:
            response.status == 400
    }


    HttpResponseDecorator get(Map<String, String> args) {
        def headers = [:]
        if (args.endpoint)
            headers['sepal-endpoint'] = args.endpoint
        if (args.user)
            headers['sepal-user'] = args.user
        client.get(
                path: 'some/request/path',
                headers: headers
        ) as HttpResponseDecorator
    }

    private String existingUser(String username) {
        sandboxManager.getUserSandbox(username) >> sandbox
        return username
    }

    private SepalSession getSandbox() {
        [containerURI: 'localhost', sessionId: 1] as SepalSession
    }

    private static class Endpoint {
        private final Undertow server
        final invoked = []
        final handler = { HttpServerExchange exchange ->
            invoked << exchange.requestURI
        }
        final int port

        Endpoint() {
            port = Port.findFree()
            server = Undertow.builder()
                    .addHttpListener(port, "0.0.0.0")
                    .setHandler(new HttpHandler() {
                void handleRequest(HttpServerExchange exchange) throws Exception {
                    handler(exchange)
                }
            }).build()
            server.start()
        }

        void stop() {
            server.stop()
        }
    }

    private static class StubSandboxManager implements SepalSessionManager {
        def aliveInvoked

        @Override
        UserSessions getUserSessions(String username) {
            throw new NonExistingUser(username)
        }

        void aliveSignal(int sessionId) {
            aliveInvoked = true
        }

        @Override
        SepalSession bindToUserSession(String username, Long sessionId) {
            return null
        }

        @Override
        SepalSession generateNewSession(String username, Long containerInstanceType) {
            return null
        }

        void start(int containerInactiveTimeout, int checkInterval) {}

        void stop() {}
    }
}
