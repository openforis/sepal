package org.openforis.sepal.user

import groovy.json.JsonOutput
import groovy.transform.Immutable
import org.openforis.sepal.security.Roles

import static org.openforis.sepal.user.User.Status.ACTIVE

@Immutable
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
    Date creationTime
    Date updateTime

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
            roles: roles,
            creationTime: creationTime,
            updateTime: updateTime)
    }

    User withDetails(String name, String email, String organization) {
        new User(
            id: id,
            name: name,
            username: username,
            email: email,
            organization: organization,
            status: status,
            roles: roles,
            creationTime: creationTime,
            updateTime: updateTime)
    }

    User active() {
        new User(
            id: id,
            name: name,
            username: username,
            email: email,
            organization: organization,
            status: ACTIVE,
            roles: roles,
            creationTime: creationTime,
            updateTime: updateTime)
    }

    Map toMap() {
        [
            id: id,
            name: name,
            username: username,
            email: email,
            organization: organization,
            googleTokens: googleTokens ? [
                accessToken: googleTokens.accessToken,
                accessTokenExpiryDate: googleTokens.accessTokenExpiryDate,
                refreshToken: googleTokens.refreshToken

            ] : null,
            status: status.name(),
            roles: roles,
            systemUser: systemUser,
            creationTime: creationTime,
            updateTime: updateTime
        ]
    }

    enum Status {
        ACTIVE, PENDING, LOCKED
    }
}
