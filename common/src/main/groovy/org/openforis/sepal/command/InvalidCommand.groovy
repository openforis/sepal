package org.openforis.sepal.command

class InvalidCommand extends RuntimeException {
    final Command command

    InvalidCommand(String message, Command command) {
        super(message + ". Command: $command")
        this.command = command
    }
}
