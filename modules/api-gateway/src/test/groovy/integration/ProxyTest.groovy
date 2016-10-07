package integration

import org.openforis.sepal.apigateway.server.EndpointConfig
import spock.lang.Unroll

class ProxyTest extends AbstractGatewayTest {
    @Unroll
    def '#fromPath -> #target, when GET #requestPath, endpoint GET #requested is requested'() {
        proxy(endpoint(fromPath, target)) {
            it.response.contentType = 'text/plain'
            it.send "Endpoint called with $it.path"
        }
        when:
        def response = httpGet(requestPath)

        then:
        oneEndpointRequestTo(requested)
        response.status == 200
        response.data.text == "Endpoint called with $requested"

        where:
        fromPath | target  | requestPath || requested
        '/'      | ''      | '/'         || '/'
        '/'      | '/'     | '/'         || '/'
        '/'      | '/'     | '/a'        || '/a'
        '/'      | '/'     | '/a/'       || '/a/'
        '/'      | '/'     | '/a/b'      || '/a/b'
        '/'      | '/a'    | '/'         || '/a/'
        '/'      | '/a'    | '/b'        || '/a/b'
        '/'      | '/a/'   | '/'         || '/a/'
        '/'      | '/a/'   | '/b'        || '/a/b'
        '/'      | '/a/b/' | '/'         || '/a/b/'
        '/'      | '/a/b'  | '/'         || '/a/b/'
        '/'      | '/a/b/' | '/c'        || '/a/b/c'
        '/'      | '/a/b'  | '/c'        || '/a/b/c'
        '/a/'    | '/a'    | '/a/'       || '/a/'
        '/a/'    | '/a/'   | '/a/'       || '/a/'
        '/a/'    | '/'     | '/a/'       || '/'
        '/a/'    | '/'     | '/a/b'      || '/b'
        '/a/'    | '/'     | '/a/b/'     || '/b/'
        '/a/'    | '/b/'   | '/a/'       || '/b/'
        '/a/'    | '/b'    | '/a/'       || '/b/'
        '/a/'    | '/b/'   | '/a/c'      || '/b/c'
        '/a/'    | '/b'    | '/a/c'      || '/b/c'
        '/a/b/'  | '/'     | '/a/b/'     || '/'
    }

    def 'When requests contains query params, endpoint get the query param'() {
        proxy(endpoint('/', '/'))

        when:
        httpGetWithQuery('/', [a: 'b'])

        then:
        request.params.a == 'b'
    }

    def 'When requests contains header, endpoint get the header'() {
        proxy(endpoint('/', '/'))

        when:
        httpGetWithHeaders('/', [a: 'b'])

        then:
        request.request.getHeader('a') == 'b'
    }

    def 'When POST request is made, endpoint get a POST and the request body'() {
        def body = null
        proxy(endpoint('/', '/')) {
            body = it.params
        }

        when:
        httpPost('/', [a: 'b'])

        then:
        request.request.method == 'POST'
        body.a == 'b'
    }

    def 'When endpoint not registered, 404 is returned'() {
        when:
        def response = httpGet('/')

        then:
        response.status == 404
    }

    def 'When endpoint return #statusCode, #statusCode is returned'() {
        proxy(endpoint('/', '/')) {
            it.halt(statusCode)
        }
        when:
        def response = httpGet('/')

        then:
        response.status == statusCode

        where:
        statusCode << [400, 404, 500]
    }

    def 'Given an exact path, when requested, 200 is returned'() {
        proxy(exactInsecure('/', "http://localhost:$endpoint.port/")) {
            send 'foo'
        }

        when:
        def response = httpGet('/')

        then:
        response.status == 200
        response.data.text == 'foo'
    }

    def 'Foo'() {
        proxy(prefixInsecure('/', "http://localhost:$endpoint.port/")) {
            send 'foo'
        }

        when:
        def response = httpGet('/')

        then:
        response.status == 200
        response.data.text == 'foo'
    }


    EndpointConfig endpoint(String path, String target) {
        prefixInsecure(path, "http://localhost:$endpoint.port$target")
    }
}

// TODO: Rewrite for the sandbox web proxy?
// rewrite ^/user/(?<user>[^/]+)/(?<service>[^/]+)\/?(?<relative>.*) /$relative break;
// proxy_redirect ~^https?://[^/]+/?(.*)$ /user/$user/$service/$1;

// TODO: More to test:
// Test WebSockets
// Test timeout (?)

// TODO: Logging

// TODO: Create config