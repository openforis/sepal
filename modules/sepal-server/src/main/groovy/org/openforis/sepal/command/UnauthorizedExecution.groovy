package org.openforis.sepal.command

class UnauthorizedExecution extends RuntimeException {
    final Command command

    UnauthorizedExecution(String message, Command command) {
        super(message)
        this.command = command
    }
}
