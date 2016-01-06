package org.openforis.sepal.scene.management

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler

/**
 * Created by monzione on 21/07/2015.
 */
class RemoveSceneCommand extends AbstractCommand<Void> {

    Integer sceneId
    Integer requestId

    RemoveSceneCommand(Integer requestId, Integer sceneId) {
        this.requestId = requestId
        this.sceneId = sceneId
    }
}

class RemoveSceneCommandHandler implements CommandHandler<Void, RemoveSceneCommand> {

    private final ScenesDownloadRepository repository

    RemoveSceneCommandHandler(ScenesDownloadRepository repository) {
        this.repository = repository
    }

    @Override
    Void execute(RemoveSceneCommand command) {
        repository.deleteScene(command.requestId, command.sceneId)
        return null
    }
}
