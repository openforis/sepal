package frontend

import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import org.openforis.sepal.Server

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson

class MockServer extends AbstractMvcFilter {
    Controller bootstrap(ServletContext servletContext) {
        def controller = Controller.builder(servletContext)
                .build()

        controller.with {
            get('/foo/{name}') {
                response.contentType = 'application/json'
                send toJson(
                        foo: params.name,
                        bar: params
                )
            }

        }
        return controller
    }

    static void main(String[] args) {
        new Server().deploy(this, 9999)
    }
}
