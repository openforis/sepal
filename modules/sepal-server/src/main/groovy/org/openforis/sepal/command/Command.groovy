package org.openforis.sepal.command

import org.openforis.sepal.user.UserRepository

import static groovymvc.validate.Constraints.custom

interface Command<R> {
    String getUsername()
}

abstract class AbstractCommand<R> implements Command<R> {
    String username

    static constraints(UserRepository userRepository) {
        [username: custom { userRepository.contains(it) }]
    }
}