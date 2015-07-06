package org.openforis.sepal.endpoint

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.Server
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.command.HandlerRegistryCommandDispatcher
import org.openforis.sepal.repository.DataSetRepository
import org.openforis.sepal.scenesdownload.RequestScenesDownload
import org.openforis.sepal.scenesdownload.RequestScenesDownloadHandler
import org.openforis.sepal.scenesdownload.ScenesDownloadRepository
import org.openforis.sepal.transaction.SqlConnectionManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson

final class Endpoints extends AbstractMvcFilter {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final Server server = new Server()

    Controller bootstrap(ServletContext servletContext) {
        def connectionManager = new SqlConnectionManager(SepalConfiguration.instance.dataSource)
        def scenesDownloadRepo = new ScenesDownloadRepository(connectionManager)
        def dataSetRepository = new DataSetRepository(connectionManager)
        def commandDispatcher = new HandlerRegistryCommandDispatcher(connectionManager)
                .register(RequestScenesDownload, new RequestScenesDownloadHandler(scenesDownloadRepo))

        def controller = Controller.builder(servletContext)
                .messageSource('messages')
                .build()

        controller.with {
            constrain(RequestScenesDownload, RequestScenesDownload.constraints(dataSetRepository))

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

        new ScenesDownloadEndPoint(commandDispatcher, scenesDownloadRepo)
                .registerWith(controller)

        return controller
    }

    void deploy() {
        def webAppPort = SepalConfiguration.instance.webAppPort
        LOG.debug("Deploying SEPAL endpoints on port $webAppPort")
        server.deploy(Endpoints, webAppPort)
    }

    void undeploy() {
        server.undeploy()
    }
}
