package org.openforis.sepal.taskexecutor.endpoint

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import groovymvc.ParamsException
import groovymvc.security.PathRestrictions
import org.openforis.sepal.endpoint.EndpointRegistry
import org.openforis.sepal.taskexecutor.api.InvalidTask

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

            error(Exception) {
                response?.status = 500
                response?.setContentType('application/json')
                send(toJson([message: "Internal Server Error"]))
            }

            get('/healthcheck', [NO_AUTHORIZATION]) {
                response.setContentType('application/json')
                send toJson([status: 'OK'])
            }

            restrict('/**', ['ADMIN'])
        }
        return controller
    }
}


