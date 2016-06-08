package org.openforis.sepal.user

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class User implements groovymvc.security.User {
    Long id
    String username
    String name
    Long userUid
    String email
    Set<String> roles

    boolean hasUsername(String username) {
        this.username.equalsIgnoreCase(username)
    }

    boolean hasRole(String role) {
        role in roles
    }
}
