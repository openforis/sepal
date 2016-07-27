package acceptance

import groovyx.net.http.RESTClient
import spock.lang.Shared
import spock.lang.Specification

import static groovyx.net.http.ContentType.URLENC

class SmokeTest extends Specification {
    @Shared endpoint = System.getenv().VAGRANT_IP
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
                body: [userName: 'admin', password: 'some password'],
                requestContentType: URLENC
        )
        if (response.status != 302)
            throw new IllegalStateException("Failed to authenticate")
        return response.headers.Location
    }
}