package endtoend

import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.RESTClient
import io.undertow.Undertow
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import org.openforis.sepal.sandbox.NonExistingUser
import org.openforis.sepal.sandbox.Sandbox
import org.openforis.sepal.sandbox.SandboxManager
import org.openforis.sepal.sandboxwebproxy.SandboxWebProxy
import spock.lang.Ignore
import spock.lang.Specification
import util.Port


class SandboxWebProxyTest extends Specification {
    def sandboxManager = Mock(SandboxManager)
    RESTClient client
    SandboxWebProxy proxy
    def endpoint1 = new Endpoint()
    def endpoint2 = new Endpoint()
    def user = existingUser('some-user')
    def anotherUser = existingUser('another-user')

    def setup() {
        sandboxManager.obtain(_) >> { throw new NonExistingUser(it.first()) }
        def port = Port.findFree()
        proxy = new SandboxWebProxy(
                port,
                [endpoint1: endpoint1.port, endpoint2: endpoint2.port],
                sandboxManager
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
            1 * sandboxManager.obtain(user) >> sandbox
    }

    def 'Multiple proxied endpoint can be invoked, without obtaining sandbox more than once'() {
        when:
            get(endpoint: 'endpoint1', user: user)
            get(endpoint: 'endpoint2', user: user)

        then:
            endpoint1.invoked.size() == 1
            endpoint2.invoked.size() == 1
            1 * sandboxManager.obtain(user) >> sandbox
    }

    def 'Multiple users can invoke the same endpoint, each obtaining its own sandbox'() {
        when:
            get(endpoint: 'endpoint1', user: user)
            get(endpoint: 'endpoint1', user: anotherUser)

        then:
            endpoint1.invoked.size() == 2
            1 * sandboxManager.obtain(user) >> sandbox
            1 * sandboxManager.obtain(anotherUser) >> sandbox
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
        sandboxManager.obtain(username) >> sandbox
        return username
    }

    private Sandbox getSandbox() {
        [uri: 'localhost'] as Sandbox
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
}
