package component.user

import org.openforis.sepal.component.user.command.RefreshGoogleAccessToken

class RefreshGoogleAccessTokenTest extends AbstractUserTest {
    def 'When refreshing access, access token is refreshed'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)

        when:
        component.submit(new RefreshGoogleAccessToken(username: user.username, tokens: tokens))

        then:
        googleOAuthClient.refreshed(tokens)
        loadUser(user.username).googleTokens == googleOAuthClient.tokens
    }
}
