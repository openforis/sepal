package org.openforis.sepal.endpoint

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import groovymvc.ParamsException
import org.openforis.sepal.Server
import org.openforis.sepal.command.ExecutionFailed
import org.openforis.sepal.component.sandboxmanager.InvalidSession
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson

final class Endpoints extends AbstractMvcFilter {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final Server server = new Server()
    private static List<EndpointRegistry> endpointRegistries = []

    Controller bootstrap(ServletContext servletContext) {
        def controller = Controller.builder(servletContext)
                .messageSource('messages')
                .build()

        endpointRegistries.each {
            it.registerEndpointsWith(controller)
        }

        controller.with {
            error(InvalidSession) {
                response?.status = 400
                response?.setContentType('application/json')
            }

            error(InvalidRequest) {
                response?.status = 400
                response?.setContentType('application/json')
                send(toJson(it?.errors))
            }

            error(ParamsException) {
                response?.status = 400
                response?.setContentType('application/json')
                send(toJson([param: it.message]))
            }

            error(ExecutionFailed) {
                response.status = 500
                response.setContentType('application/json')
                send(toJson([
                        command: it.command.class.simpleName
                ]))
            }
        }
        return controller
    }

    static void deploy(int port, EndpointRegistry... endpointRegistries) {
        this.endpointRegistries = endpointRegistries.toList()
        LOG.debug("Deploying SEPAL endpoints on port $port")
        server.deploy(Endpoints, port)
    }

    static void undeploy() {
        server?.undeploy()
    }
}
