package component.user

import org.openforis.sepal.component.user.command.AssociateGoogleAccount

class AssociateGoogleAccountTest extends AbstractUserTest {
    def 'Given an active user, when associatingaccount, tokens become accessible on the user, is stored in user home dir, and change listener is notified'() {
        def user = activeUser()

        when:
        component.submit(new AssociateGoogleAccount(username: user.username))

        then:
        def userTokens = loadUser(testUsername).googleTokens
        userTokens == googleOAuthClient.tokens
        googleAccessTokenFile(user.username).exists()
        googleAccessTokenFile(user.username).text == userTokens.accessToken
        changeListener.lastChange(user.username) == loadUser(user.username).toMap()
    }

    def 'Given non-whitelisted google account, when associating, tokens are not associated'() {
        def user = activeUser()
        googleEarthEngineWhitelistChecker.notWhiteListed()

        when:
        component.submit(new AssociateGoogleAccount(username: user.username))

        then:
        !loadUser(testUsername).googleTokens
    }
}
