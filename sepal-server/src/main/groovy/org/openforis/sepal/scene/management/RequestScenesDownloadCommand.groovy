package org.openforis.sepal.scene.management

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler

import static groovymvc.validate.Constraints.custom
import static groovymvc.validate.Constraints.minLength

@ToString
class RequestScenesDownloadCommand extends AbstractCommand<Void> {
    int dataSetId
    String processingChain
    List<String> sceneIds = []

    static constraints(DataSetRepository dataSetRepository) {
        [
                dataSetId: custom { dataSetRepository.containsDataSetWithId(it) },
                sceneIds : minLength(1)
        ]
    }
}

class RequestScenesDownloadCommandHandler implements CommandHandler<Void, RequestScenesDownloadCommand> {
    private final ScenesDownloadRepository repository

    RequestScenesDownloadCommandHandler(ScenesDownloadRepository repository) {
        this.repository = repository
    }

    public Void execute(RequestScenesDownloadCommand command) {
        repository.saveDownloadRequest(command)
        return null
    }
}
