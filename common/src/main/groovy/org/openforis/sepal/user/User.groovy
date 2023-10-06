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
    String intendedUse
    GoogleTokens googleTokens
    boolean emailNotificationsEnabled
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
                intendedUse: intendedUse,
                emailNotificationsEnabled: emailNotificationsEnabled,
                status: status,
                roles: roles,
                creationTime: creationTime,
                updateTime: updateTime)
    }

    User withDetails(String name, String email, String organization, String intendedUse, boolean emailNotificationsEnabled, boolean admin) {
        new User(
                id: id,
                name: name,
                username: username,
                email: email,
                organization: organization,
                intendedUse: intendedUse,
                emailNotificationsEnabled: emailNotificationsEnabled,
                status: status,
                roles: admin ? [Roles.ADMIN] : [],
                creationTime: creationTime,
                updateTime: updateTime)
    }

    User enableEmailNotifications() {
        new User(
                id: id,
                name: name,
                username: username,
                email: email,
                organization: organization,
                intendedUse: intendedUse,
                emailNotificationsEnabled: true,
                status: status,
                roles: admin ? [Roles.ADMIN] : [],
                creationTime: creationTime,
                updateTime: updateTime)
    }

    User disableEmailNotifications() {
        new User(
                id: id,
                name: name,
                username: username,
                email: email,
                organization: organization,
                intendedUse: intendedUse,
                emailNotificationsEnabled: false,
                status: status,
                roles: admin ? [Roles.ADMIN] : [],
                creationTime: creationTime,
                updateTime: updateTime)
    }

    User withUpdateTime(Date updateTime) {
        new User(
                id: id,
                name: name,
                username: username,
                email: email,
                organization: organization,
                intendedUse: intendedUse,
                emailNotificationsEnabled: emailNotificationsEnabled,
                status: status,
                roles: roles,
                creationTime: creationTime,
                updateTime: updateTime)
    }

    User withStatus(Status status) {
        new User(
                id: id,
                name: name,
                username: username,
                email: email,
                organization: organization,
                intendedUse: intendedUse,
                emailNotificationsEnabled: emailNotificationsEnabled,
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
                intendedUse: intendedUse,
                emailNotificationsEnabled: emailNotificationsEnabled,
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
                intendedUse: intendedUse,
                googleTokens: googleTokens ? [
                        accessToken: googleTokens.accessToken,
                        accessTokenExpiryDate: googleTokens.accessTokenExpiryDate,
                        refreshToken: googleTokens.refreshToken,
                        projectId: googleTokens.projectId
                ] : null,
                emailNotificationsEnabled: emailNotificationsEnabled,
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
