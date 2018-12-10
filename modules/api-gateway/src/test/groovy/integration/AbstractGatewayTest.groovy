package integration

import fake.FakeUserServer
import fake.server.TestServer
import groovy.transform.stc.ClosureParams
import groovy.transform.stc.SimpleType
import groovymvc.RequestContext
import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.RESTClient
import org.apache.http.HttpRequest
import org.apache.http.HttpResponse
import org.apache.http.ProtocolException
import org.apache.http.client.RedirectStrategy
import org.apache.http.client.methods.HttpUriRequest
import org.apache.http.protocol.HttpContext
import org.openforis.sepal.apigateway.server.EndpointConfig
import org.openforis.sepal.apigateway.server.ProxyServer
import org.openforis.sepal.apigateway.server.ProxyConfig
import spock.lang.Specification
import util.Port

import static groovyx.net.http.ContentType.URLENC

abstract class AbstractGatewayTest extends Specification {
    final httpPort = Port.findFree()
    final FakeUserServer userServer = new FakeUserServer().start() as FakeUserServer
    final TestServer endpoint = new TestServer().start()
    private ProxyServer server
    final List<RequestContext> requests = []
    final String validUsername = userServer.validUsername
    final String validPassword = userServer.validPassword
    final http = createHttp()

    final void proxy(EndpointConfig endpointConfig,
                     @ClosureParams(value = SimpleType, options = ['groovymvc.RequestContext'])
                     @DelegatesTo(RequestContext) Closure callback = {}) {
        server = new ProxyServer(new ProxyConfig(
                keyFile: new File(getClass().getResource('/test.key').file),
                certificateFile: new File(getClass().getResource('/test.crt').file),
                httpPort: httpPort,
                authenticationUrl: "${userServer.url}authenticate",
                logoutPath: '/logout',
                endpointConfigs: [endpointConfig]
        )).start()
        endpoint.route {
            requests << it
            callback.delegate = it
            callback.call(it)
        }
    }

    final HttpResponseDecorator httpGet(String path) {
        http.get(path: path) as HttpResponseDecorator
    }

    final HttpResponseDecorator httpGetWithAuthentication(String path, String username, String password) {
        def client = http
        client.get(path: path, headers: [
                'Authorization': 'Basic ' + "$username:$password".bytes.encodeBase64()
        ]) as HttpResponseDecorator
    }

    final HttpResponseDecorator httpGetWithHeaders(String path, Map<String, String> headers) {
        http.get(path: path, headers: headers) as HttpResponseDecorator
    }

    final HttpResponseDecorator httpGetWithQuery(String path, Map<String, String> query) {
        http.get(path: path, query: query) as HttpResponseDecorator
    }

    final HttpResponseDecorator httpPost(String path, Map<String, String> body) {
        http.post(path: path, requestContentType: URLENC, body: body) as HttpResponseDecorator
    }

    final HttpResponseDecorator delete(String path) {
        http.delete(path: path) as HttpResponseDecorator
    }

    void cleanup() {
        server.stop()
        endpoint.stop()
        userServer.stop()
    }

    RequestContext getRequest() {
        requests.last()
    }

    final void oneEndpointRequestTo(String path) {
        assert requests.size() == 1
        def request = requests.first()
        assert request.path == path
    }

    final RESTClient createHttp() {
        def http = new RESTClient("http://localhost:$httpPort/")
        http.handler.failure = { return it }
        http.ignoreSSLIssues()
        http.client.setRedirectStrategy(new NoRedirect())
        return http
    }

    final EndpointConfig prefixInsecure(String path, String target) {
        return new EndpointConfig(
                path: path,
                target: URI.create(target),
                https: false,
                authenticate: false,
                prefix: true)
    }

    static EndpointConfig exactInsecure(String path, String target) {
        return new EndpointConfig(
                path: path,
                target: URI.create(target),
                https: false,
                authenticate: false,
                prefix: false)
    }

    private static class NoRedirect implements RedirectStrategy {
        boolean isRedirected(
                HttpRequest request,
                HttpResponse response,
                HttpContext context)
                throws ProtocolException {
            return false
        }

        HttpUriRequest getRedirect(
                HttpRequest request,
                HttpResponse response,
                HttpContext context)
                throws ProtocolException {
            return null
        }
    }
}
