package org.openforis.sepal.component.user.adapter

import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.user.User
import org.openforis.sepal.util.Terminal

class TerminalBackedExternalUserDataGateway implements ExternalUserDataGateway {
    void createUser(String username) {
        Terminal.execute(new File('.'),
                'sudo add-sepal-user',
                username,
                UUID.randomUUID().toString(),
                'sepalUsers')
    }

    void changePassword(String username, String password) {
        Terminal.execute(new File('.'),
                'sudo change-sepal-user-password',
                username,
                password,
                'sepalUsers')
    }
}
