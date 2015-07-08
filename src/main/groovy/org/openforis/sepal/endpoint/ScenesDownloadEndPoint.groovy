package org.openforis.sepal.endpoint

import groovymvc.Controller
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.scenesdownload.RequestScenesDownload
import org.openforis.sepal.scenesdownload.ScenesDownloadRepository

import static groovy.json.JsonOutput.toJson

public class ScenesDownloadEndPoint {
    private CommandDispatcher commandDispatcher
    private ScenesDownloadRepository repo

    ScenesDownloadEndPoint(CommandDispatcher commandDispatcher, ScenesDownloadRepository repo) {
        this.commandDispatcher = commandDispatcher
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
                def command = bindAndValidateJson(new RequestScenesDownload(), body)
                commandDispatcher.submit(command)
            }
        }
    }
}
