package org.openforis.sepal.endpoint

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import groovymvc.ParamsException
import groovymvc.security.PathRestrictions
import org.openforis.sepal.command.ExecutionFailed

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson

final class Endpoints extends AbstractMvcFilter {
    private final PathRestrictions pathRestrictions
    private final List<EndpointRegistry> endpointRegistries

    Endpoints(PathRestrictions pathRestrictions, EndpointRegistry... endpointRegistries) {
        this.pathRestrictions = pathRestrictions
        this.endpointRegistries = endpointRegistries.toList()
    }

    Controller bootstrap(ServletContext servletContext) {
        def controller = Controller.builder(servletContext)
                .pathRestrictions(pathRestrictions)
                .messageSource('messages')
                .build()

        endpointRegistries.each {
            it.registerEndpointsWith(controller)
        }

        controller.with {
            restrict('/**', [])

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
}

