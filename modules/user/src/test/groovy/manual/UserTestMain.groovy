package manual

import fake.FakeExternalUserDataGateway
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.component.user.Main
import org.openforis.sepal.component.user.ServerConfig
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.security.Roles
import org.openforis.sepal.user.User

class UserTestMain extends Main {
    private FakeExternalUserDataGateway userDataGateway

    private FakeExternalUserDataGateway createFakeExternalUserDataGateway() {
        def userDataGateway = new FakeExternalUserDataGateway()
        userDataGateway.createdUser(new User(
            id: 1,
            name: 'Sepal Admin',
            username: 'sepalAdmin',
            email: 'admin@sepal.io',
            organization: 'Some Org',
            googleTokens: null,
            status: User.Status.ACTIVE,
            roles: [Roles.ADMIN] as Set,
            systemUser: true
        ))
        userDataGateway.changePassword('sepalAdmin', 'password')
        userDataGateway.createdUser(new User(
            id: 2,
            name: 'Admin',
            username: 'admin',
            email: 'admin@sepal.io',
            organization: 'Some Org',
            googleTokens: null,
            status: User.Status.ACTIVE,
            roles: [Roles.ADMIN] as Set,
            systemUser: false
        ))
        userDataGateway.changePassword('admin', 'password')
        return userDataGateway
    }

    UsernamePasswordVerifier createUsernamePasswordVerifier(ServerConfig serverConfig) {
        userDataGateway ?: createFakeExternalUserDataGateway()
    }

    ExternalUserDataGateway createExternalUserDataGateway() {
        userDataGateway ?: createFakeExternalUserDataGateway()
    }

    static void main(String[] args) {
        new UserTestMain()
    }
}
