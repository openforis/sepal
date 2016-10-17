package component.user

import org.openforis.sepal.user.User

class InviteUserTest extends AbstractUserTest {
    def 'When inviting user, it is included in the user list, with expected properties'() {
        when:
        inviteUser()

        then:
        def users = listUsers()
        users?.size() == 1
        def user = users.first()
        user.id
        user.name == testName
        user.username == testUsername
        user.email == testEmail
        user.status == User.Status.PENDING
    }

    def 'When inviting user, user is created through the external data gateway, and an invitation email is sent'() {
        when:
        def user = inviteUser()

        then:
        user.id
        externalUserDataGateway.createdUser(user)
        mailServer.emailCount == 1
    }
}

