package org.openforis.sepal.user

import org.openforis.sepal.security.Roles
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class User implements groovymvc.security.User {
    Long id
    String name
    String username
    String email
    String organization
    Status status
    Set<String> roles

    boolean hasUsername(String username) {
        this.username.equalsIgnoreCase(username)
    }

    boolean hasRole(String role) {
        role in roles
    }

    boolean isAdmin() {
        hasRole(Roles.ADMIN)
    }

    User withId(long id) {
        new User(
                id: id,
                name: name,
                username: username,
                email: email,
                organization: organization,
                status: status,
                roles: roles)
    }

    enum Status {
        ACTIVE, PENDING, LOCKED
    }
}
