package component.user

import org.openforis.sepal.component.user.command.RevokeGoogleAccountAccess

class RevokeGoogleAccountAccessTest extends AbstractUserTest {
    def 'When revoking access, access is removed from Google and user has no Google tokens'() {
        def user = activeUser()
        def tokens = associateGoogleAccount(username: user.username)

        when:
        component.submit(new RevokeGoogleAccountAccess(username: user.username, tokens: tokens))

        then:
        googleOAuthClient.revoked(tokens)
        !loadUser(user.username).googleTokens
    }
}
