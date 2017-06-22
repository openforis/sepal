package org.openforis.sepal.endpoint

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import groovymvc.ParamsException
import groovymvc.security.PathRestrictions
import org.openforis.sepal.command.ExecutionFailed
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson

final class Endpoints extends AbstractMvcFilter {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final PathRestrictions pathRestrictions
    private final List<EndpointRegistry> endpointRegistries

    Endpoints(PathRestrictions pathRestrictions, EndpointRegistry... endpointRegistries) {
        this.pathRestrictions = pathRestrictions
        this.endpointRegistries = endpointRegistries.toList()
    }

    Controller bootstrap(ServletContext servletContext) {
        def controller = Controller.builder(servletContext)
                .pathRestrictions(pathRestrictions)
                .build()

        endpointRegistries.each {
            it.registerEndpointsWith(controller)
        }

        controller.with {
            restrict('/**', [])

            before('/**') {
                LOG.debug(requestContext.description)
                response.characterEncoding = 'UTF-8'
                response.contentType = 'application/json'
            }

            error(InvalidRequest) {
                response?.status = 400
                response?.setContentType('application/json')
                LOG.warn("Invalid request: $requestContext.description. Errors: ${it.errors}")
                send(toJson(it?.errors))
            }

            error(ParamsException) {
                response?.status = 400
                response?.setContentType('application/json')
                LOG.warn("Invalid request $requestContext.description. ${[message: it.message]}")
                send(toJson([param: it.message]))
            }

            error(ExecutionFailed) {
                LOG.error("Error executing " + requestContext.description, it)
                response.status = 500
                response.setContentType('application/json')
                send(toJson([
                        command: it.command.class.simpleName
                ]))
            }

            error(Exception) {
                response?.status = 500
                response?.setContentType('application/json')
                LOG.error("Error executing " + requestContext.description, it)
                send(toJson([message: "Internal Server Error"]))
            }

            get('/healthcheck', [NO_AUTHORIZATION]) {
                response.setContentType('application/json')
                send toJson([status: 'OK'])
            }
        }
        return controller
    }
}

