package org.openforis.sepal.component.dataprovider.management

import groovymvc.Controller
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.endpoint.SepalEndpoint

import static groovy.json.JsonOutput.toJson

class ScenesDownloadEndPoint extends SepalEndpoint {
    private final DataSetRepository dataSetRepository
    private final ScenesDownloadRepository downloadRepository

    ScenesDownloadEndPoint(CommandDispatcher commandDispatcher,
                           DataSetRepository dataSetRepository,
                           ScenesDownloadRepository downloadRepository) {
        super(commandDispatcher)
        this.dataSetRepository = dataSetRepository
        this.downloadRepository = downloadRepository
    }

    void registerWith(Controller controller) {
        controller.with {
            constrain(RequestScenesDownloadCommand, RequestScenesDownloadCommand.constraints(dataSetRepository, downloadRepository))

            get('downloadRequests/{user}') {
                response.contentType = 'application/json'
                def requests = downloadRepository.findUserRequests(params.user as String)
                send(toJson(requests))
            }
            post('downloadRequests') {
                def theBody = body
                def command = bindAndValidateJson(new RequestScenesDownloadCommand(), theBody)
                commandDispatcher.submit(command)
            }

            delete('downloadRequests/{requestId}') {
                commandDispatcher.submit(new RemoveRequestCommand(params.requestId as Integer))
            }

            delete('downloadRequests/{requestId}/{sceneId}') {
                commandDispatcher.submit(new RemoveSceneCommand(params.requestId as int, params.sceneId as int))
            }


        }
    }
}
