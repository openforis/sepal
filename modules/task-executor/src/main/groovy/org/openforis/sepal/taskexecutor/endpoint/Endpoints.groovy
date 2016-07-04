package org.openforis.sepal.taskexecutor.endpoint

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import groovymvc.ParamsException
import groovymvc.security.PathRestrictions
import org.openforis.sepal.taskexecutor.api.InvalidTask
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson

final class Endpoints extends AbstractMvcFilter {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final Server server = new Server()
    private static PathRestrictions pathRestrictions
    private static List<EndpointRegistry> endpointRegistries = []

    Controller bootstrap(ServletContext servletContext) {
        def controller = Controller.builder(servletContext)
                .pathRestrictions(pathRestrictions)
                .build()

        endpointRegistries.each {
            it.registerEndpointsWith(controller)
        }

        controller.with {

            error(ParamsException) {
                response?.status = 400
                response?.setContentType('application/json')
                send(toJson([param: it.message]))
            }

            error(InvalidTask) {
                response?.status = 400
                response?.setContentType('application/json')
                send(toJson([message: it.message, task: it.task]))
            }

            get('/healthcheck', [NO_AUTHORIZATION]) {
                response.setContentType('application/json')
                send toJson([status: 'OK'])
            }

            restrict('/**', ['ADMIN'])
        }

        return controller
    }

    static void deploy(int port, PathRestrictions pathRestrictions, EndpointRegistry... endpointRegistries) {
        Endpoints.pathRestrictions = pathRestrictions
        Endpoints.endpointRegistries = endpointRegistries
        LOG.debug("Deploying SEPAL endpoints on port $port")
        server.deploy(Endpoints, port)
    }

    static void undeploy() {
        server?.undeploy()
    }
}


