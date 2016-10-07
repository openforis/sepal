package fake

import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.user.User

class FakeExternalUserDataGateway implements ExternalUserDataGateway, UsernamePasswordVerifier {
    private final List<String> createdUsers = []
    private final Map<String, String> passwordByUsername = [:]

    void createUser(String username) {
        createdUsers << username
    }

    void changePassword(String username, String password) {
        passwordByUsername[username] = password
    }

    boolean verify(String username, String password) {
        return password == passwordByUsername[username]
    }

    boolean createdUser(User user) {
        createdUsers.contains(user.username)
    }

    String password(String username) {
        passwordByUsername[username]
    }
}
