package component.user

import org.openforis.sepal.user.User

class InviteUserTest extends AbstractUserTest {
    def 'When inviting user, it is included in the user list, with expected properties'() {
        when:
        def invitedUser = inviteUser()

        then:
        def users = listUsers()
        def user = users.find { it.username == invitedUser.username}
        user
        user.id
        user.name == testName
        user.username == testUsername
        user.email == testEmail
        user.status == User.Status.PENDING
    }

    def 'When inviting user, user is created through the external data gateway, an invitation email is sent, and change listener is notified'() {
        when:
        def user = inviteUser()

        then:
        user.id
        def username = user.username
        externalUserDataGateway.createdUser(user)
        mailServer.emailCount == 1
        with(changeListener) {
            changeCount(username) == 1
            lastChange(username) == user.toMap()
        }
    }
}

