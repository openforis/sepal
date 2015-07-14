package org.openforis.sepal.endpoint

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.Server
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.scene.management.DataSetRepository
import org.openforis.sepal.scene.management.RequestScenesDownloadCommand
import org.openforis.sepal.scene.management.RequestScenesDownloadCommandHandler
import org.openforis.sepal.scene.management.ScenesDownloadEndPoint
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson

final class Endpoints extends AbstractMvcFilter {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final Server server = new Server()

    private static DataSetRepository dataSetRepository
    private static HandlerRegistryCommandDispatcher commandDispatcher
    private static RequestScenesDownloadCommandHandler requestScenesDownloadHandler
    private static ScenesDownloadEndPoint scenesDownloadEndPoint

    Controller bootstrap(ServletContext servletContext) {
        commandDispatcher.register(RequestScenesDownloadCommand, requestScenesDownloadHandler)

        def controller = Controller.builder(servletContext)
                .messageSource('messages')
                .build()

        controller.with {
            constrain(RequestScenesDownloadCommand, RequestScenesDownloadCommand.constraints(dataSetRepository))

            error(InvalidRequest) {
                response.status = 400
                response.setContentType('application/json')
                send(toJson(it.errors))
            }

            error(ExecutionFailed) {
                response.status = 500
                response.setContentType('application/json')
                send(toJson([
                        command: it.command.class.simpleName
                ]))
            }
        }

        scenesDownloadEndPoint.registerWith(controller)

        return controller
    }


    static void deploy(
            DataSetRepository dataSetRepository,
            HandlerRegistryCommandDispatcher commandDispatcher,
            RequestScenesDownloadCommandHandler requestScenesDownloadHandler,
            ScenesDownloadEndPoint scenesDownloadEndPoint) {
        this.dataSetRepository = dataSetRepository
        this.commandDispatcher = commandDispatcher
        this.requestScenesDownloadHandler = requestScenesDownloadHandler
        this.scenesDownloadEndPoint = scenesDownloadEndPoint

        def webAppPort = SepalConfiguration.instance.webAppPort
        LOG.debug("Deploying SEPAL endpoints on port $webAppPort")
        server.deploy(Endpoints, webAppPort)
    }

    static void undeploy() {
        server.undeploy()
    }
}
