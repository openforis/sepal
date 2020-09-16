package org.openforis.sepal.component.user.query

import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

class EmailNotificationsEnabled implements Query<Boolean> {
    String email
}

class EmailNotificationsEnabledHandler implements QueryHandler<Boolean, EmailNotificationsEnabled> {
    private UserRepository userRepository

    EmailNotificationsEnabledHandler(UserRepository userRepository) {
        this.userRepository = userRepository
    }

    Boolean execute(EmailNotificationsEnabled query) {
        return userRepository.emailNotificationsEnabled(query.email)
    }
}
