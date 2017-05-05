package component.user

import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.component.user.command.RefreshGoogleAccessToken

class RefreshGoogleAccessTokenTest extends AbstractUserTest {
    def 'When refreshing access, access token is refreshed'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)

        when:
        def refreshed = component.submit(new RefreshGoogleAccessToken(username: user.username, tokens: tokens))

        then:
        googleOAuthClient.refreshed(tokens)
        loadUser(user.username).googleTokens == googleOAuthClient.tokens
        googleAccessTokenFile(user.username).exists()
        googleAccessTokenFile(user.username).text == refreshed.accessToken
    }

    def 'Given an invalid refresh token, when refreshing access, null is returned, and token is removed from user'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)
        googleOAuthClient.failWith(new GoogleOAuthClient.InvalidToken(''))

        when:
        component.submit(new RefreshGoogleAccessToken(username: user.username, tokens: tokens))

        then:
        !googleOAuthClient.refreshed(tokens)
        !loadUser(user.username).googleTokens
        !googleAccessTokenFile(user.username).exists()
    }

    def 'Given failing OAuth, when refreshing access, exception is thrown'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)
        googleOAuthClient.failWith(new GoogleOAuthClient.GoogleOAuthException('Some error'))

        when:
        component.submit(new RefreshGoogleAccessToken(username: user.username, tokens: tokens))

        then:
        thrown ExecutionFailed
        !googleOAuthClient.refreshed(tokens)
        loadUser(user.username).googleTokens == tokens
        googleAccessTokenFile(user.username).exists()
        googleAccessTokenFile(user.username).text == tokens.accessToken
    }
}
