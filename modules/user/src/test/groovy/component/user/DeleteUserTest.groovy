package component.user

import org.openforis.sepal.component.user.command.DeleteUser

class DeleteUserTest extends AbstractUserTest {
    def 'Given an active user, when deleting user, user is removed from the db through the external gateway'() {
        def user = activeUser()
        def username = user.username

        when:
        component.submit(new DeleteUser(username: username))

        then:
        !(user in listUsers())
        externalUserDataGateway.deletedUser(user)
        changeListener.lastChange(username) == null
    }
}
