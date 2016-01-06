package org.openforis.sepal

import groovymvc.AbstractMvcFilter
import io.undertow.Undertow
import io.undertow.server.handlers.resource.ClassPathResourceManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static io.undertow.Handlers.path
import static io.undertow.Handlers.resource
import static io.undertow.servlet.Servlets.*
import static javax.servlet.DispatcherType.REQUEST

class Server {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private Undertow server

    void deploy(Class<? extends AbstractMvcFilter> appClass, int port,
                List<Class<? extends EventListener>> listeners = []) {
        def contextPath = '/data'
        LOG.info("Deploying server on port $port")
        def servletBuilder = deployment()
                .setClassLoader(appClass.classLoader)
                .setContextPath(contextPath)
                .setDeploymentName('app.war')
                .addFilter(filter('main', appClass))
                .addFilterUrlMapping('main', '/*', REQUEST)
                .addListeners(listeners.collect { listener(it) })

        def manager = defaultContainer().addDeployment(servletBuilder)
        manager.deploy()

        def httpHandler = manager.start()
        def handler = path(resource(new ClassPathResourceManager(appClass.classLoader, 'dist')))
                .addPrefixPath(contextPath, httpHandler)

        server = Undertow.builder()
                .addHttpListener(port, "0.0.0.0")
                .setHandler(handler)
                .build()
        server.start()
    }

    void undeploy() {
        server.stop()
    }
}

