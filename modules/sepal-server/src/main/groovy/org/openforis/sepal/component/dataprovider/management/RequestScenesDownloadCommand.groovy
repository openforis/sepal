package org.openforis.sepal.component.dataprovider.management

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.util.RegExpr
import org.openforis.sepal.util.annotation.Data

import static groovymvc.validate.Constraints.custom
import static groovymvc.validate.Constraints.minLength

@Data
class RequestScenesDownloadCommand extends AbstractCommand<Void> {
    int dataSetId
    String processingChain
    Boolean groupScenes
    String requestName
    List<String> sceneIds = []

    static constraints(DataSetRepository dataSetRepository, ScenesDownloadRepository downloadRepository) {
        [
                dataSetId  : custom { dataSetRepository.containsDataSetWithId(it) },
                sceneIds   : minLength(1),
                requestName: custom { String reqName, RequestScenesDownloadCommand command ->
                    reqName != null ? RegExpr.match("^[a-zA-Z0-9]+\$", reqName) && !downloadRepository.requestNameExist(command.username, reqName) : true
                }
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
