package org.openforis.sepal.command

interface CommandHandler<R, C extends Command<R>> {
    R execute(C command)
}

interface AfterCommitCommandHandler<R, C extends Command<R>> extends CommandHandler<R, C> {
    void afterCommit(C command, R result)
}