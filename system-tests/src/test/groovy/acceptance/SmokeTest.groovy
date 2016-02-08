package acceptance

import groovyx.net.http.RESTClient
import spock.lang.Shared
import spock.lang.Specification

import static groovyx.net.http.ContentType.URLENC

class SmokeTest extends Specification {
    @Shared endpoint = 'https://172.28.128.3'
    @Shared httpClient = new RESTClient(endpoint)

    def setupSpec() {
        httpClient.ignoreSSLIssues()
        login()
    }

    def 'Can access the dashboard'() {
        when:
        def response = httpClient.get(path: '/dashboard')

        then:
        response.status == 200
    }

    def 'Can ssh into container'() {
        when: true
        then: false
    }

    String login() {
        def response = httpClient.post(
                path: "/login",
                body: [userName: 'sepalAdminWeb', password: 'the admin user 123'],
                requestContentType: URLENC
        )
        if (response.status != 302)
            throw new IllegalStateException("Failed to authenticate")
        return response.headers.Location
    }
}