package org.openforis.sepal.command

import groovy.transform.EqualsAndHashCode

interface Command<R> {
    String getUsername()
}

@EqualsAndHashCode
abstract class AbstractCommand<R> implements Command<R> {
    String username
}