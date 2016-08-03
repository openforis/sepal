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

class TestServer {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private Closure before
    private Closure get
    private Undertow server
    int port
    private UUID serverId

    void register(Controller controller) {

    }

    final TestServer start() {
        serverId = UUID.randomUUID()
        port = Port.findFree()
        LOG.info("Deploying server on port ${port}")
        def servletBuilder = deployment()
                .setClassLoader(this.class.classLoader)
                .setContextPath('/')
                .setDeploymentName('app.war')
                .addFilter(filter('main', Filter.class))
                .addFilterUrlMapping('main', '/*', REQUEST)
                .addServletContextAttribute('owner', this)

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
        get = callback
    }

    final void before(@DelegatesTo(RequestContext) Closure callback) {
        before = callback
    }

    final void stop() {
        server?.stop()
    }

    protected boolean isGetRegistered() {
        get != null
    }

    protected boolean isBeforeRegistered() {
        before != null
    }

    static class Filter extends AbstractMvcFilter {
        final Controller bootstrap(ServletContext servletContext) {
            def owner = servletContext.getAttribute('owner') as TestServer
            owner.with {
                def controller = Controller.builder(servletContext)
                        .pathRestrictions(
                        new PathRestrictions(
                                new FakeUserProvider(),
                                new BasicRequestAuthenticator('Test', new FakeUsernamePasswordVerifier())
                        )
                ).build()
                if (isGetRegistered())
                    controller.get('/**', get)
                if (isBeforeRegistered())
                    controller.before('/**', before)
                register(controller)
                return controller
            }
        }
    }

}

