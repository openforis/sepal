package org.openforis.sepal.component.user.query

import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.user.User

class ListUsers implements Query<List<User>> {

}

class ListUsersHandler implements QueryHandler<List<User>, ListUsers> {
    private final UserRepository userRepository

    ListUsersHandler(UserRepository userRepository) {
        this.userRepository = userRepository
    }

    List<User> execute(ListUsers query) {
        userRepository.listUsers()
    }
}
