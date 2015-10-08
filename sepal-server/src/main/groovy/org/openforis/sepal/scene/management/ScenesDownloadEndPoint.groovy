package org.openforis.sepal.scene.management

import groovymvc.Controller
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.endpoint.SepalEndpoint

import static groovy.json.JsonOutput.toJson

public class ScenesDownloadEndPoint extends SepalEndpoint {

    private ScenesDownloadRepository repo

    ScenesDownloadEndPoint(CommandDispatcher commandDispatcher, ScenesDownloadRepository repo) {
        super(commandDispatcher)
        this.repo = repo
    }

    void registerWith(Controller controller) {
        controller.with {

            get('downloadRequests/{user}') {
                response.contentType = 'application/json'
                def requests = repo.findUserRequests(params.user as String)
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
