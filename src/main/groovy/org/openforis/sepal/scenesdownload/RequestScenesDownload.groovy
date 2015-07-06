package org.openforis.sepal.scenesdownload

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.repository.DataSetRepository

import static groovymvc.validate.Constraints.custom
import static groovymvc.validate.Constraints.minLength

@ToString
class RequestScenesDownload extends AbstractCommand<Void> {
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

class RequestScenesDownloadHandler implements CommandHandler<Void, RequestScenesDownload> {
    private final ScenesDownloadRepository repository

    RequestScenesDownloadHandler(ScenesDownloadRepository repository) {
        this.repository = repository
    }

    public Void execute(RequestScenesDownload command) {
        repository.saveDownloadRequest(command)
        return null
    }
}
