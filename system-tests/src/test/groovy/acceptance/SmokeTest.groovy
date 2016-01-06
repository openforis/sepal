package acceptance

import groovyx.net.http.RESTClient
import spock.lang.Shared
import spock.lang.Specification

import static groovyx.net.http.ContentType.URLENC

class SmokeTest extends Specification {
    @Shared endpoint = 'https://172.28.128.3'
    @Shared client = new RESTClient(endpoint)

    def setupSpec() {
        client.ignoreSSLIssues()
        login()
    }

    def 'Can access the dashboard'() {
        when:
        def response = client.get(path: '/dashboard')

        then:
        response.status == 200
    }

    String login() {
        def response = client.post(
                path: "/login",
                body: [userName: 'sepalAdminWeb', password: 'the admin user 123'],
                requestContentType: URLENC
        )
        if (response.status != 302)
            throw new IllegalStateException("Failed to authenticate")
        return response.headers.Location
    }
}