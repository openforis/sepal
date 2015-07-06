package org.openforis.sepal.command

interface CommandHandler<R, C extends Command<R>> {
    R execute(C command)
}