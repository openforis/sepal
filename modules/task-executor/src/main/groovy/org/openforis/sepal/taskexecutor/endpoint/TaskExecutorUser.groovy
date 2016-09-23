package org.openforis.sepal.taskexecutor.endpoint

import groovymvc.security.User
import groovymvc.security.UserProvider
import groovymvc.security.UsernamePasswordVerifier
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class TaskExecutorUser implements User {
    String username
    String name
    String email
    Set<String> roles

    boolean hasUsername(String username) {
        this.username.equalsIgnoreCase(username)
    }

    boolean hasRole(String role) {
        role in roles
    }
}

class TaskExecutorUserProvider implements UserProvider {
    private final TaskExecutorUser sepalUser


    TaskExecutorUserProvider(String sepalUsername) {
        this.sepalUser = new TaskExecutorUser(
                username: sepalUsername,
                roles: ['ADMIN'].toSet()
        )
    }

    User lookup(String username) {
        sepalUser.hasUsername(username) ? sepalUser : null
    }
}

class SepalAdminUsernamePasswordVerifier implements UsernamePasswordVerifier {
    private final String sepalUsername
    private final String sepalPassword

    SepalAdminUsernamePasswordVerifier(String sepalUsername, String sepalPassword) {
        this.sepalUsername = sepalUsername
        this.sepalPassword = sepalPassword
    }

    boolean verify(String username, String password) {
        username == sepalUsername && password == sepalPassword
    }
}
