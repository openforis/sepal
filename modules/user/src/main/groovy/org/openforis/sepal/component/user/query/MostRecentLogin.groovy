package org.openforis.sepal.component.user.query

import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.user.User

class MostRecentLogin implements Query<Map<String, Date>> {
    String username
}

class MostRecentLoginHandler implements QueryHandler<Map<String, Date>, MostRecentLogin> {
    private final UserRepository userRepository

    MostRecentLoginHandler(UserRepository userRepository) {
        this.userRepository = userRepository
    }

    Map<String, Date> execute(MostRecentLogin query) {
        userRepository.mostRecentLogin(query.username)
    }
}
