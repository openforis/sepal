package org.openforis.sepal.component.user.query

import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.user.User

class MostRecentLoginByUser implements Query<Map<String, Date>> {
    String username
}

class MostRecentLoginByUserHandler implements QueryHandler<Map<String, Date>, MostRecentLoginByUser> {
    private final UserRepository userRepository

    MostRecentLoginByUserHandler(UserRepository userRepository) {
        this.userRepository = userRepository
    }

    Map<String, Date> execute(MostRecentLoginByUser query) {
        userRepository.mostRecentLoginByUser()
    }
}
