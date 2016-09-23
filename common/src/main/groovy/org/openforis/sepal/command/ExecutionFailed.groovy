package org.openforis.sepal.command

class ExecutionFailed extends RuntimeException {
    final CommandHandler handler
    final Command command

    ExecutionFailed(CommandHandler handler, Command command, Exception cause) {
        super("Failed to execute $command using ${handler.class.name}", cause)
        this.command = command
        this.handler = handler
    }
}
