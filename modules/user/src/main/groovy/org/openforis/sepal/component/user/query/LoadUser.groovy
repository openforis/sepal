package org.openforis.sepal.component.user.query

import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.user.User

class LoadUser implements Query<User> {
    String username
}

class LoadUserHandler implements QueryHandler<User, LoadUser> {
    private UserRepository userRepository

    LoadUserHandler(UserRepository userRepository) {
        this.userRepository = userRepository
    }

    User execute(LoadUser query) {
        return userRepository.lookupUser(query.username)
    }
}
