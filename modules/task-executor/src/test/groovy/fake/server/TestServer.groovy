package fake.server

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
    private int port

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

    final TestServer start() {
        port = Port.findFree()
        LOG.info("Deploying server on port ${port}")
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
        return this
    }

    final URI getHost() {
        URI.create("http://localhost:$port/")
    }

    final void stop() {
        server?.stop()
    }
}

