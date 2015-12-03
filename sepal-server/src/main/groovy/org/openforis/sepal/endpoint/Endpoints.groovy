package org.openforis.sepal.endpoint

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.Server
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.scene.management.*
import org.openforis.sepal.session.InvalidSession
import org.openforis.sepal.session.SepalSessionEndpoint
import org.openforis.sepal.session.command.*
import org.openforis.sepal.user.UserRepository
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
    private static SepalSessionEndpoint sandboxManagerEndpoint
    private static ScenesDownloadRepository scenesDownloadRepository
    private static RemoveSceneCommandHandler singleSceneDeleteCommandHandler

    private static ObtainUserSessionCommandHandler obtainUserSandboxCommandHandler
    private static SessionAliveCommandHandler containerAliveCommandHandler
    private static UserRepository userRepository

    private static GetUserSessionsCommandHandler getUserSessionsCommandHandler
    private static BindToUserSessionCommandHandler bindToUserSessionCommandHandler


    Controller bootstrap(ServletContext servletContext) {
        commandDispatcher.register(RequestScenesDownloadCommand, requestScenesDownloadHandler)
        commandDispatcher.register(RemoveRequestCommand, deleteCommandHandler)
        commandDispatcher.register(RemoveSceneCommand, singleSceneDeleteCommandHandler)
        commandDispatcher.register(ObtainUserSessionCommand, obtainUserSandboxCommandHandler)
        commandDispatcher.register(SessionAliveCommand, containerAliveCommandHandler)
        commandDispatcher.register(GetUserSessionsCommand,getUserSessionsCommandHandler)
        commandDispatcher.register(BindToUserSessionCommand,bindToUserSessionCommandHandler)

        def controller = Controller.builder(servletContext)
                .messageSource('messages')
                .build()

        controller.with {
            constrain(ObtainUserSessionCommand, ObtainUserSessionCommand.constraints(userRepository))
            constrain(RequestScenesDownloadCommand, RequestScenesDownloadCommand.constraints(dataSetRepository, scenesDownloadRepository))
            constrain(GetUserSessionsCommand, GetUserSessionsCommand.constraints(userRepository))
            constrain(BindToUserSessionCommand, BindToUserSessionCommand.constraints(userRepository))

            error(InvalidSession) {
                response?.status = 400
                response?.setContentType('application/json')
            }


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
            SepalSessionEndpoint sandboxManagerEndpoint,
            ObtainUserSessionCommandHandler obtainUserSandboxCommandHandler,
            SessionAliveCommandHandler containerAliveCommandHandler,
            UserRepository userRepository,
            GetUserSessionsCommandHandler getUserSessionsCommandHandler,
            BindToUserSessionCommandHandler bindToUserSessionCommandHandler) {
        this.dataSetRepository = dataSetRepository
        this.commandDispatcher = commandDispatcher
        this.requestScenesDownloadHandler = requestScenesDownloadHandler
        this.scenesDownloadEndPoint = scenesDownloadEndPoint
        this.scenesDownloadRepository = scenesDownloadRepository
        this.deleteCommandHandler = deleteCommandHandler
        this.singleSceneDeleteCommandHandler = singleSceneDeleteCommandHandler
        this.sandboxManagerEndpoint = sandboxManagerEndpoint
        this.obtainUserSandboxCommandHandler = obtainUserSandboxCommandHandler
        this.containerAliveCommandHandler = containerAliveCommandHandler
        this.userRepository = userRepository
        this.getUserSessionsCommandHandler = getUserSessionsCommandHandler
        this.bindToUserSessionCommandHandler = bindToUserSessionCommandHandler
        def webAppPort = SepalConfiguration.instance.webAppPort
        LOG.debug("Deploying SEPAL endpoints on port $webAppPort")
        server.deploy(Endpoints, webAppPort)
    }

    static void undeploy() {
        server.undeploy()
    }
}
