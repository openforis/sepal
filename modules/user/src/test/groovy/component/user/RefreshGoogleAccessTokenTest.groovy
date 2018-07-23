package component.user

import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.user.adapter.GoogleOAuthException
import org.openforis.sepal.component.user.adapter.InvalidToken
import org.openforis.sepal.component.user.command.RefreshGoogleAccessToken
import org.openforis.sepal.user.User

class RefreshGoogleAccessTokenTest extends AbstractUserTest {
    def 'When refreshing token, access token is refreshed and change listener is notified'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)

        when:
        def refreshed = component.submit(new RefreshGoogleAccessToken(username: user.username, tokens: tokens))

        then:
        googleOAuthClient.refreshed(tokens)
        def refreshedUser = loadUser(user.username)
        refreshedUser.googleTokens == googleOAuthClient.tokens
        googleAccessTokenFile(user.username).exists()
        googleAccessTokenFile(user.username).text == refreshed.accessToken
        changeListener.lastChange(user.username) == refreshedUser.toMap()
    }

    def 'Given an invalid refresh token, when refreshing token, null is returned, and token is removed from user'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)
        googleOAuthClient.failWith(new InvalidToken(''))

        when:
        component.submit(new RefreshGoogleAccessToken(username: user.username, tokens: tokens))

        then:
        !googleOAuthClient.refreshed(tokens)
        !loadUser(user.username).googleTokens
        !googleAccessTokenFile(user.username).exists()
    }

    def 'Given failing OAuth, when refreshing token, exception is thrown'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)
        googleOAuthClient.failWith(new GoogleOAuthException('Some error'))

        when:
        component.submit(new RefreshGoogleAccessToken(username: user.username, tokens: tokens))

        then:
        thrown ExecutionFailed
        !googleOAuthClient.refreshed(tokens)
        loadUser(user.username).googleTokens == tokens
        googleAccessTokenFile(user.username).exists()
        googleAccessTokenFile(user.username).text == tokens.accessToken
    }

    def 'Given no tokens specified, when refreshing token, token for user is refreshed'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)

        when:
        component.submit(new RefreshGoogleAccessToken(username: user.username))

        then:
        googleOAuthClient.refreshed(tokens)
        loadUser(user.username).googleTokens == googleOAuthClient.tokens
    }

    def 'User is not associated with Google account, when refreshing token, no exception is thrown and null is returned'() {
        def user = activeUser()

        expect:
        component.submit(new RefreshGoogleAccessToken(username: user.username)) == null
    }
}
