package integration

import groovyx.net.http.HttpResponseDecorator
import org.openforis.sepal.apigateway.server.EndpointConfig
import spock.lang.Unroll

import javax.servlet.http.HttpServletRequest

class Secure_Endpoint_ProxyTest extends AbstractGatewayTest {
    @Unroll
    def '#path -> #target, when HTTP GET #request, redirects to HTTPS #location'() {
        proxy(endpoint(fromPath, target))

        when:
        def response = httpGetWithQuery(requestPath, query)

        then:
        response.status == 302
        def redirectedTo = response.headers.location
        def expectedRedirect = "https://localhost:$httpsPort$location"
        redirectedTo == expectedRedirect

        where:
        fromPath | target | requestPath | query            || location
        '/'      | '/'    | '/'         | [:]              || '/'
        '/'      | '/'    | '/a'        | [b: 'c', d: 'e'] || '/a?b=c&d=e'
        '/'      | '/a'   | '/'         | [:]              || '/'
        '/'      | '/a'   | '/a'        | [:]              || '/a'
        '/'      | '/'    | '/a'        | [:]              || '/a'
        '/a'     | '/'    | '/a'        | [:]              || '/a'
    }

    def 'Given no session, when GET, 401 and auth challenge is returned'() {
        proxy(endpoint('/', '/'))

        when:
        def response = httpsGet('/')

        then:
        response.status == 401
        gotAuthChallenge(response)
    }

    def 'Given no session and No-auth-challenge header, when GET, 401 and no auth challenge is returned'() {
        proxy(endpoint('/', '/'))

        when:
        def response = httpsGetWithHeaders('/', ['No-auth-challenge': 'true'])

        then:
        response.status == 401
        !response.headers['WWW-Authenticate']
    }

    def 'Given valid auth header, when GET, endpoint is accessed'() {
        proxy(endpoint('/', '/'))

        when:
        def response = httpsGetWithAuthentication('/', validUsername, validPassword)

        then:
        response.status == 200
    }

    def 'Given invalid credentials, when GET, 401 and auth challenge is returned'() {
        proxy(endpoint('/', '/'))

        when:
        def response = httpsGetWithAuthentication('/', 'non-existing', 'some-password')

        then:
        response.status == 401
        gotAuthChallenge(response)
    }

    def 'Given already authenticated user, when GET, 200 is returned'() {
        proxy(endpoint('/', '/')) {
            response.contentType = 'text/plain'
            send "Endpoint called with $it.path"
        }
        httpsGetWithAuthentication('/', validUsername, validPassword)

        when:
        def response = httpsGet('/')

        then:
        response.status == 200
        response.data.text == 'Endpoint called with /'
    }

    def 'Given already authenticated user and endpoint creating session, when GET, 200 is returned'() {
        proxy(endpoint('/', '/')) {
            ((HttpServletRequest) it.request).getSession(true) // Create session
            response.contentType = 'text/plain'
            send "Endpoint called with $it.path"
        }
        httpsGetWithAuthentication('/', validUsername, validPassword)
        httpsGet('/')

        when:
        def response = httpsGet('/')

        then:
        response.status == 200
        response.data.text == 'Endpoint called with /'
    }


    private void gotAuthChallenge(HttpResponseDecorator response) {
        assert response.headers['WWW-Authenticate']?.value == 'Basic realm="Sepal"'
    }

    EndpointConfig endpoint(String path, String target) {

        return new EndpointConfig(
                path: path,
                target: URI.create("http://localhost:$endpoint.port$target"),
                https: true,
                authenticate: true,
                prefix: true)
    }
}
