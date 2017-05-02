package component.user

import org.openforis.sepal.component.user.query.GoogleAccessRequestUrl

class GoogleAccessRequestUrlTest extends AbstractUserTest {
    def 'When getting request access url, expected url is returned'() {
        def expectedUrl = URI.create('http://some-redirect/url')
        googleOAuthClient.redirectUri = expectedUrl

        expect:
        component.submit(new GoogleAccessRequestUrl()) == expectedUrl
    }
}

