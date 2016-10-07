package org.openforis.sepal.component.user.api

import org.openforis.sepal.user.User

interface UserRepository {
    User insertUser(User user, String token)

    List<User> listUsers()

    User lookupUser(String username)

    Map tokenStatus(String token)

    void invalidateToken(String token)

    void updateStatus(String username, User.Status status)
}
