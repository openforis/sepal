package component.user

import org.openforis.sepal.component.user.adapter.InvalidToken
import org.openforis.sepal.component.user.command.RevokeGoogleAccountAccess
import org.openforis.sepal.user.User

class RevokeGoogleAccountAccessTest extends AbstractUserTest {
    def 'When revoking access, access is removed from Google, user has no Google tokens, and change listener is notified'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)

        when:
        component.submit(new RevokeGoogleAccountAccess(username: user.username, tokens: tokens))

        then:
        googleOAuthClient.revoked(tokens)
        def revokedUser = loadUser(user.username)
        !revokedUser.googleTokens
        !googleAccessTokenFile(user.username).exists()
        changeListener.lastChange(user.username) == revokedUser.toMap()
    }

    def 'Given an invalid token, token is removed from user'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)
        googleOAuthClient.failWith(new InvalidToken(''))

        when:
        component.submit(new RevokeGoogleAccountAccess(username: user.username, tokens: tokens))

        then:
        !loadUser(user.username).googleTokens
        !googleAccessTokenFile(user.username).exists()

    }
}
