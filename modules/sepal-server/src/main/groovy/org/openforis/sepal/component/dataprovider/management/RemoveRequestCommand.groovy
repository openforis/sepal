package org.openforis.sepal.component.dataprovider.management

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler

class RemoveRequestCommand extends AbstractCommand<Void> {

    Integer requestId


    RemoveRequestCommand(int requestId) {
        this.requestId = requestId
    }
}

class RemoveRequestCommandHandler implements CommandHandler<Void, RemoveRequestCommand> {

    private final ScenesDownloadRepository repository

    RemoveRequestCommandHandler(ScenesDownloadRepository repository) {
        this.repository = repository
    }

    @Override
    Void execute(RemoveRequestCommand command) {
        repository.deleteRequest(command.requestId)
        return null
    }
}
