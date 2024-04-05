package org.openforis.sepal.component.user.adapter

import org.openforis.sepal.component.user.api.ExternalUserDataGateway
import org.openforis.sepal.util.Terminal
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class TerminalBackedExternalUserDataGateway implements ExternalUserDataGateway {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    void createUser(String username) {
        def output = Terminal.execute(new File('.'),
                'add-sepal-user',
                username,
                UUID.randomUUID().toString(),
                'sepalUsers')
        LOG.debug("createUser($username)" + output)
    }

    void changePassword(String username, String password) {
        def output = Terminal.execute(new File('.'),
                'change-sepal-user-password',
                username,
                password,
                'sepalUsers')
        LOG.debug("changePassword($username)" + output)
    }

    void deleteUser(String username) {
        def output = Terminal.execute(new File('.'),
                'delete-sepal-user',
                username)
        LOG.debug("deleteUser($username)" + output)
    }
}
