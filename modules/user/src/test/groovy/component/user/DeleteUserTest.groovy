package component.user

import org.openforis.sepal.component.user.command.DeleteUser

class DeleteUserTest extends AbstractUserTest {
    def 'Given an active user, when deleting user, user is removed from the db through the external gateway'() {
        def user = activeUser()

        when:
        component.submit(new DeleteUser(username: user.username))

        then:
        listUsers() == []
        externalUserDataGateway.deletedUser(user)
    }
}
