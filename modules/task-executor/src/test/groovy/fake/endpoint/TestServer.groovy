package fake.endpoint

import fake.FakeUserProvider
import fake.FakeUsernamePasswordVerifier
import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import groovymvc.security.BasicRequestAuthenticator
import groovymvc.security.PathRestrictions
import io.undertow.Undertow
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import util.Port

import javax.servlet.ServletContext

import static io.undertow.Handlers.path
import static io.undertow.servlet.Servlets.*
import static javax.servlet.DispatcherType.REQUEST

abstract class TestServer extends AbstractMvcFilter {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private Undertow server

    final Controller bootstrap(ServletContext servletContext) {
        def controller = Controller.builder(servletContext)
                .pathRestrictions(
                new PathRestrictions(
                        new FakeUserProvider(),
                        new BasicRequestAuthenticator('Test', new FakeUsernamePasswordVerifier())
                )
        ).build()
        register(controller)
        return controller
    }

    abstract void register(Controller controller)

    final void start() {
//        def port = Port.findFree()
        def port = 55260
        LOG.info("Deploying server on port $port")
        def servletBuilder = deployment()
                .setClassLoader(this.class.classLoader)
                .setContextPath('/')
                .setDeploymentName('app.war')
                .addFilter(filter('main', this.class))
                .addFilterUrlMapping('main', '/*', REQUEST)

        def manager = defaultContainer().addDeployment(servletBuilder)
        manager.deploy()

        def httpHandler = manager.start()
        def handler = path(httpHandler)

        server = Undertow.builder()
                .addHttpListener(port, "0.0.0.0")
                .setHandler(handler)
                .build()
        addShutdownHook { stop() }
        server.start()
    }

    final void stop() {
        server?.stop()
    }
}

