package integration

import groovyx.net.http.HttpResponseDecorator
import org.openforis.sepal.apigateway.server.EndpointConfig

import javax.servlet.http.HttpServletRequest

class Secure_Endpoint_ProxyTest extends AbstractGatewayTest {
    def 'Given no session, when GET, 401 and auth challenge is returned'() {
        proxy(endpoint('/', '/'))

        when:
        def response = httpGet('/')

        then:
        response.status == 401
        gotAuthChallenge(response)
    }

    def 'Given no session and No-auth-challenge header, when GET, 401 and no auth challenge is returned'() {
        proxy(endpoint('/', '/'))

        when:
        def response = httpGetWithHeaders('/', ['No-auth-challenge': 'true'])

        then:
        response.status == 401
        !response.headers['WWW-Authenticate']
    }

    def 'Given valid auth header, when GET, endpoint is accessed'() {
        proxy(endpoint('/', '/'))

        when:
        def response = httpGetWithAuthentication('/', validUsername, validPassword)

        then:
        response.status == 200
    }

    def 'Given invalid credentials, when GET, 401 and auth challenge is returned'() {
        proxy(endpoint('/', '/'))

        when:
        def response = httpGetWithAuthentication('/', 'non-existing', 'some-password')

        then:
        response.status == 401
        gotAuthChallenge(response)
    }

    def 'Given already authenticated user, when GET, 200 is returned'() {
        proxy(endpoint('/', '/')) {
            response.contentType = 'text/plain'
            send "Endpoint called with $it.path"
        }
        httpGetWithAuthentication('/', validUsername, validPassword)

        when:
        def response = httpGet('/')

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
        httpGetWithAuthentication('/', validUsername, validPassword)
        httpGet('/')

        when:
        def response = httpGet('/')

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
            https: false,
            authenticate: true,
            prefix: true)
    }
}
