package org.openforis.sepal.command

class Unauthorized extends RuntimeException {
    final Command command

    Unauthorized(String message, Command command) {
        super(message)
        this.command = command
    }
}
