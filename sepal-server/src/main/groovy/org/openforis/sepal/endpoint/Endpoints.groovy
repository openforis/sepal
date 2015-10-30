package org.openforis.sepal.endpoint

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.Server
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.sandbox.*
import org.openforis.sepal.scene.management.*
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
    private static RemoveRequestCommandHandler deleteCommandHandler
    private static ScenesDownloadEndPoint scenesDownloadEndPoint
    private static SandboxManagerEndpoint sandboxManagerEndpoint
    private static ScenesDownloadRepository scenesDownloadRepository
    private static RemoveSceneCommandHandler singleSceneDeleteCommandHandler
    private static ObtainUserSandboxCommandHandler obtainUserSandboxCommandHandler
    private static ReleaseUserSandboxCommandHandler releaseUserSandboxCommandHandler


    Controller bootstrap(ServletContext servletContext) {
        commandDispatcher.register(RequestScenesDownloadCommand, requestScenesDownloadHandler)
        commandDispatcher.register(RemoveRequestCommand, deleteCommandHandler)
        commandDispatcher.register(RemoveSceneCommand, singleSceneDeleteCommandHandler)
        commandDispatcher.register(ObtainUserSandboxCommand, obtainUserSandboxCommandHandler)
        commandDispatcher.register(ReleaseUserSandboxCommand, releaseUserSandboxCommandHandler)

        def controller = Controller.builder(servletContext)
                .messageSource('messages')
                .build()

        controller.with {
            constrain(RequestScenesDownloadCommand, RequestScenesDownloadCommand.constraints(dataSetRepository,scenesDownloadRepository))

            error(InvalidRequest) {
                response?.status = 400
                response?.setContentType('application/json')
                send(toJson(it?.errors))
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
        sandboxManagerEndpoint.registerWith(controller)
        return controller
    }


    static void deploy(
            DataSetRepository dataSetRepository,
            HandlerRegistryCommandDispatcher commandDispatcher,
            RequestScenesDownloadCommandHandler requestScenesDownloadHandler,
            ScenesDownloadEndPoint scenesDownloadEndPoint,
            ScenesDownloadRepository scenesDownloadRepository,
            RemoveRequestCommandHandler deleteCommandHandler,
            RemoveSceneCommandHandler singleSceneDeleteCommandHandler,
            SandboxManagerEndpoint sandboxManagerEndpoint,
            ObtainUserSandboxCommandHandler obtainUserSandboxCommandHandler,
            ReleaseUserSandboxCommandHandler releaseUserSandboxCommandHandler) {
        this.dataSetRepository = dataSetRepository
        this.commandDispatcher = commandDispatcher
        this.requestScenesDownloadHandler = requestScenesDownloadHandler
        this.scenesDownloadEndPoint = scenesDownloadEndPoint
        this.scenesDownloadRepository = scenesDownloadRepository
        this.deleteCommandHandler = deleteCommandHandler
        this.singleSceneDeleteCommandHandler = singleSceneDeleteCommandHandler
        this.sandboxManagerEndpoint = sandboxManagerEndpoint
        this.obtainUserSandboxCommandHandler = obtainUserSandboxCommandHandler
        this.releaseUserSandboxCommandHandler = releaseUserSandboxCommandHandler
        def webAppPort = SepalConfiguration.instance.webAppPort
        LOG.debug("Deploying SEPAL endpoints on port $webAppPort")
        server.deploy(Endpoints, webAppPort)
    }

    static void undeploy() {
        server.undeploy()
    }
}
