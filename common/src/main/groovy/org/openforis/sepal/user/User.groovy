package org.openforis.sepal.user

import groovy.json.JsonOutput
import org.openforis.sepal.security.Roles
import org.openforis.sepal.util.annotation.ImmutableData

import static org.openforis.sepal.user.User.Status.ACTIVE

@ImmutableData
class User implements groovymvc.security.User {
    Long id
    String name
    String username
    String email
    String organization
    GoogleTokens googleTokens
    Status status
    Set<String> roles
    boolean systemUser

    boolean hasUsername(String username) {
        this.username.equalsIgnoreCase(username)
    }

    boolean hasRole(String role) {
        role in roles
    }

    boolean isAdmin() {
        hasRole(Roles.ADMIN)
    }

    String jsonString() {
        JsonOutput.toJson(this)
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

    User withDetails(String name, String email, String organization) {
        new User(
                id: id,
                name: name,
                username: username,
                email: email,
                organization: organization,
                status: status,
                roles: roles)
    }

    User active() {
        new User(
                id: id,
                name: name,
                username: username,
                email: email,
                organization: organization,
                status: ACTIVE,
                roles: roles)
    }

    enum Status {
        ACTIVE, PENDING, LOCKED
    }
}
