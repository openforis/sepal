package component.user

import org.openforis.sepal.component.user.command.AssociateGoogleAccount

class AssociateGoogleAccountTest extends AbstractUserTest {
    def 'Given an active user, when associating a google account, tokens become accessible on the user and is stored in user home dir'() {
        def user = activeUser()

        when:
        component.submit(new AssociateGoogleAccount(username: user.username))

        then:
        def userTokens = loadUser(testUsername).googleTokens
        userTokens == googleOAuthClient.tokens
        googleAccessTokenFile(user.username).exists()
        googleAccessTokenFile(user.username).text == userTokens.accessToken
    }
}
