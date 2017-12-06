package org.openforis.sepal.component.datasearch.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler

class UpdateSceneMetaData extends AbstractCommand<Void> {
}

class UpdateSceneMetaDataHandler implements CommandHandler<Void, UpdateSceneMetaData> {
    private final List<? extends CommandHandler> handlers

    UpdateSceneMetaDataHandler(List<? extends CommandHandler> handlers) {
        this.handlers = handlers
    }

    Void execute(UpdateSceneMetaData command) {
        handlers.each {
            it.execute(null)
        }
        return null
    }
}
