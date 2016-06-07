package org.openforis.sepal.command

import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.user.UserRepository

import static groovymvc.validate.Constraints.custom

interface Command<R> {
    String getUsername()
}

@EqualsAndHashCode
abstract class AbstractCommand<R> implements Command<R> {
    String username

    static constraints(UserRepository userRepository) {
        [username: custom { userRepository.contains(it) }]
    }
}