package fake.server

import fake.FakeUserProvider
import fake.FakeUsernamePasswordVerifier
import groovymvc.AbstractMvcFilter
import groovymvc.Controller
import groovymvc.RequestContext
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

class TestServer extends AbstractMvcFilter {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static Closure before
    private static Closure get
    private Undertow server
    int port

    final Controller bootstrap(ServletContext servletContext) {
        def controller = Controller.builder(servletContext)
                .pathRestrictions(
                new PathRestrictions(
                        new FakeUserProvider(),
                        new BasicRequestAuthenticator('Test', new FakeUsernamePasswordVerifier())
                )
        ).build()
        if (get)
            controller.get('/**', get)
        if (before)
            controller.before('/**', before)
        get = null
        before = null
        register(controller)
        return controller
    }

    void register(Controller controller) {

    }

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

    final URI getUri() {
        URI.create("http://localhost:$port/")
    }

    final void get(@DelegatesTo(RequestContext) Closure callback) {
        this.get = callback
    }

    final void before(@DelegatesTo(RequestContext) Closure callback) {
        this.before = callback
    }

    final void stop() {
        server?.stop()
    }
}

