package fake

import groovy.json.JsonSlurper
import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import org.openforis.sepal.endpoint.Server
import org.spockframework.util.IoUtil
import util.Port

import javax.servlet.ServletContext

import static groovy.json.JsonOutput.toJson

class FakeEarthExplorer extends AbstractMvcFilter {
    private final Server server = new Server()
    final int port
    final String url

    FakeEarthExplorer() {
        port = Port.findFree()
        url = "http://localhost:$port/data/"
        server.deploy(FakeEarthExplorer, this.port)
    }

    Controller bootstrap(ServletContext servletContext) {
        def controller = Controller.builder(servletContext).build()
        controller.with {
            get('/login') {
                response.setContentType('application/json')
                send(toJson(data: 'a fake auth token'))
            }

            get('/download') {
                def jsonRequest = new JsonSlurper().parseText(params.jsonRequest as String)
                def requestedEntities = jsonRequest.entityIds

                response.setContentType('application/json')
                send(toJson(data: requestedEntities.collect { "${url}entity/${it}.tar.gz?some=param" }))
            }

            get('/entity/{entityId}') {
                response.setHeader("Content-Disposition", "attachment; filename=\"${params.entityId}\"")
                def input = getClass().getResourceAsStream('/scene.tar.gz')
                IoUtil.copyStream(input, response.outputStream)
            }
        }
        return controller
    }

    void stop() {
        server.undeploy()
    }

}
