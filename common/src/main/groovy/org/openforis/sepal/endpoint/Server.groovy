package org.openforis.sepal.endpoint

import io.undertow.Undertow
import org.openforis.sepal.util.lifecycle.Lifecycle
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.servlet.*

import static io.undertow.servlet.Servlets.*
import static javax.servlet.DispatcherType.REQUEST

final class Server implements Lifecycle {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final String APP_ATTR = 'sepal.app'

    final int port
    final String host
    private final Filter app
    private final Undertow server

    Server(int port, Filter app) {
        this(port, '/', app)
    }

    Server(int port, String contextPath, Filter app) {
        this.port = port
        this.host = "localhost:$port"
        this.app = app
        LOG.info("Deploying server on port $port")
        def servletBuilder = deployment()
                .setClassLoader(app.class.classLoader)
                .setContextPath(contextPath)
                .setDeploymentName('app.war')
                .addFilter(filter('main', DelegatingFilter))
                .addFilterUrlMapping('main', '/*', REQUEST)
                .addServletContextAttribute(APP_ATTR, app)

        def manager = defaultContainer().addDeployment(servletBuilder)
        manager.deploy()

        def httpHandler = manager.start()
        server = Undertow.builder()
                .addHttpListener(port, "0.0.0.0")
                .setHandler(httpHandler)
                .build()
    }

    void start() {
        server.start()
    }

    void stop() {
        server?.stop()
    }

    private static class DelegatingFilter implements Filter {
        private Filter app

        void init(FilterConfig filterConfig) throws ServletException {
            app = filterConfig.servletContext.getAttribute(APP_ATTR) as Filter
            this.app.init(filterConfig)
        }

        void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
            app.doFilter(request, response, chain)
        }

        void destroy() {
            app.destroy()
        }
    }
}

