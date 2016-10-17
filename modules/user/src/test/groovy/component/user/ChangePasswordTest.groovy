package component.user

import org.openforis.sepal.component.user.command.ChangePassword

class ChangePasswordTest extends AbstractUserTest {
    def 'When changing password, user cannot authenticate with old password but with new'() {
        activeUser(password: 'current password')

        when:
        def success = component.submit(new ChangePassword(
                username: testUsername,
                oldPassword: 'current password',
                newPassword: 'new password'
        ))

        then:
        success
        !authenticate(testUsername, 'current password')
        authenticate(testUsername, 'new password')
    }

    def 'Given invalid current password, when changing password, user can still authenticate with old password, and not with new'() {
        activeUser(password: 'current password')

        when:
        def success = component.submit(new ChangePassword(
                username: testUsername,
                oldPassword: 'invalid current password',
                newPassword: 'new password'
        ))

        then:
        !success
        authenticate(testUsername, 'current password')
        !authenticate(testUsername, 'new password')
    }
}
