package component.user

import org.openforis.sepal.component.user.command.AssociateGoogleAccount
import org.openforis.sepal.user.GoogleTokens

class AssociateGoogleAccountTest extends AbstractUserTest {
    def 'Given an active user, when associating a google account, tokens become accessible on the user'() {
        activeUser(username: testUsername)

        when:
        component.submit(new AssociateGoogleAccount(username: testUsername))

        then:
        def userTokens = loadUser(testUsername).googleTokens
        userTokens == googleOAuthClient.tokens
    }
}
