package component.user

import org.openforis.sepal.component.user.command.UpdateUserDetails

class UpdateUserDetailsTest extends AbstractUserTest {
    def 'When updating user, update is made, and change listener is notified'() {
        activeUser(username: testUsername)

        when:
        component.submit(new UpdateUserDetails(
                usernameToUpdate: testUsername,
                name: 'Updated Name',
                email: 'updated@email.com',
                organization: 'Updated organization'
        ))

        then:
        def loadedUser = loadUser(testUsername)
        def userProps = loadedUser.properties.subMap(['username', 'name', 'email', 'organization'])
        userProps == [
                username    : testUsername,
                name        : 'Updated Name',
                email       : 'updated@email.com',
                organization: 'Updated organization',
        ]
        changeListener.lastChange(testUsername) == loadedUser.toMap()
    }
}
