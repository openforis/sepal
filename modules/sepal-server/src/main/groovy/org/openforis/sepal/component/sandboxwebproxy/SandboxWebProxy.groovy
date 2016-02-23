package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.Handlers
import io.undertow.Undertow
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import io.undertow.server.session.*
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.command.CreateSession
import org.openforis.sepal.component.sandboxmanager.command.JoinSession
import org.openforis.sepal.component.sandboxmanager.query.FindInstanceTypes
import org.openforis.sepal.component.sandboxmanager.query.LoadSandboxInfo
import org.openforis.sepal.hostingservice.WorkerInstanceType
import org.openforis.sepal.user.NonExistingUser
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

import static io.undertow.server.session.SessionListener.SessionDestroyedReason

/**
 * Proxy for web endpoints on user sandboxes. It provides the user a single, static url for each endpoint.
 * The proxy will make sure a sandbox is obtained, delegates requests to it.
 * <p>
 * Requests to this proxy requires two request headers:
 * <ul>
 * <li>{@code sepal-endpoint} - the name of the endpoint to proxy
 * <li>{@code sepal-user} - the username of the user who's sandbox to proxy
 * </ul>
 */
class SandboxWebProxy {
    private final static Logger LOG = LoggerFactory.getLogger(this)
    static final String SANDBOX_ID_KEY = "sepal-sandbox-id"
    static final String USERNAME_KEY = "sepal-user"

    private final Undertow server
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor()
    private final int sessionHeartbeatInterval
    private final int sessionDefaultTimeout

    private SessionManager sessionManager
    private final SandboxManagerComponent sandboxManagerComponent

    /**
     * Creates the proxy.
     * @param port the port the proxy run on
     * @param endpointByPort specifies which port each proxied endpoint run on
     * @param sandboxManager the sandbox manager used to obtain sandboxes.
     */
    SandboxWebProxy(int port, Map<String, Integer> endpointByPort, SandboxManagerComponent sandboxManagerComponent,
                    int sessionHeartbeatInterval, int sessionDefaultTimeout) {
        LOG.info("Creating SandboxWebProxy [port: $port. Endpoints: $endpointByPort, sessionHeartbeatInterval: $sessionHeartbeatInterval, sessionDefaultTimeout: ${sessionDefaultTimeout}]")
        this.sessionHeartbeatInterval = sessionHeartbeatInterval
        this.sessionDefaultTimeout = sessionDefaultTimeout
        this.sandboxManagerComponent = sandboxManagerComponent
        this.server = Undertow.builder()
                .addHttpListener(port, "0.0.0.0")
                .setHandler(createHandler(endpointByPort))
                .build()
    }

    private HttpHandler createHandler(Map<String, Integer> endpointByPort) {
        sessionManager = new InMemorySessionManager('sandbox-web-proxy', 1000, true)
        sessionManager.setDefaultSessionTimeout(sessionDefaultTimeout)
        sessionManager.registerSessionListener(new Listener())
        new SepalHttpHandler(
                new SessionAttachmentHandler(
                        Handlers.proxyHandler(
                                new DynamicProxyClient(
                                        new SessionBasedUriProvider(endpointByPort, sandboxManagerComponent)
                                )
                        ), sessionManager, new SessionCookieConfig())
        )
    }

    void start() {
        server.start()
        executor.scheduleWithFixedDelay(
                new WebProxySessionMonitor(sandboxManagerComponent, sessionManager),
                sessionHeartbeatInterval,
                sessionHeartbeatInterval, TimeUnit.SECONDS
        )
    }

    void stop() {
        executor.shutdown();
        server.stop()
    }

    static Long sandboxSessionId(Session session) {
        session.getAttribute(SANDBOX_ID_KEY) as Long
    }

    static String username(Session session) {
        session.getAttribute(USERNAME_KEY) as String
    }

    private static class Listener extends SessionDestroyedListener {
        void sessionDestroyed(Session session, HttpServerExchange exchange, SessionDestroyedReason reason) {
            LOG.info("HTTP session closed for user ${username(session)}. Reason: $reason")
        }
    }

    private static class SessionBasedUriProvider implements DynamicProxyClient.UriProvider {
        private final Map<String, Integer> endpointByPort
        private final SandboxManagerComponent sandboxManagerComponent

        SessionBasedUriProvider(Map<String, Integer> endpointByPort, SandboxManagerComponent sandboxManagerComponent) {
            this.endpointByPort = endpointByPort
            this.sandboxManagerComponent = sandboxManagerComponent
        }

        URI provide(HttpServerExchange exchange) {
            def session = getOrCreateSession(exchange)
            def endpoint = determineEndpoint(exchange)
            def username = determineUsername(exchange)


            def uriSessionKey = determineUriSessionKey(endpoint, username)
            def uri = session.getAttribute(uriSessionKey) as URI
            if (!uri) {
                def sandboxHost = determineUri(username, session)
                uri = URI.create("http://$sandboxHost:${endpointByPort[endpoint]}")
                session.setAttribute(uriSessionKey, uri)
                session.setAttribute(USERNAME_KEY, username)
            }
//            return uri
            return URI.create('http://52.37.34.242:8787')
        }

        private static String determineUsername(HttpServerExchange exchange) {
            def username = exchange.requestHeaders.getFirst(USERNAME_KEY)
            if (!username)
                throw new BadRequest("Missing header: $USERNAME_KEY")
            return username
        }

        private String determineEndpoint(HttpServerExchange exchange) {
            def endpoint = exchange.requestHeaders.getFirst('sepal-endpoint')
            if (!endpoint)
                throw new BadRequest('Missing header: sepal-endpoint')
            if (!endpointByPort.containsKey(endpoint))
                throw new BadRequest("Non-existing sepal-endpoint: ${endpoint}")
            return endpoint
        }

        private String determineUri(String user, Session session) {
            def sessionKey = determineSandboxHostSessionKey(user)
            String sandboxHost = session.getAttribute(sessionKey) as String
            if (!sandboxHost) {
                // TODO: Redirect to sandbox/instance creation/selection GUI
                SandboxSession sepalSession
                try {
                    def sepalSessions = findActiveSepalSessions(user)
                    if (sepalSessions)
                        sepalSession = joinSession(user, sepalSessions)
                    else
                        sepalSession = createSession(user)
                } catch (NonExistingUser e) {
                    throw new BadRequest(e.getMessage())
                }
                // TODO: What if this isn't an active session?
                session.setAttribute(SANDBOX_ID_KEY, sepalSession.id)
                session.setAttribute(sessionKey, sepalSession.host)
                sandboxHost = sepalSession.host
            }
            return sandboxHost
        }

        private List<SandboxSession> findActiveSepalSessions(String username) {
            sandboxManagerComponent.submit(
                    new LoadSandboxInfo(username: username)
            ).activeSessions
        }

        private SandboxSession joinSession(String user, List<SandboxSession> sepalSessions) {
            sandboxManagerComponent.submit(
                    new JoinSession(username: user, sessionId: sepalSessions.first().id)
            )
        }

        private SandboxSession createSession(String username) {
            sandboxManagerComponent.submit(
                    new CreateSession(username: username, instanceType: defaultInstanceType())
            )
        }

        private WorkerInstanceType defaultInstanceType() {
            sandboxManagerComponent.submit(
                    new FindInstanceTypes()
            ).first()
        }

        private String determineSandboxHostSessionKey(String username) {
            return 'sepal-sandbox-host' + username
        }


        private String determineUriSessionKey(String endpoint, String username) {
            return 'sepal-target-uri-' + endpoint + '|' + username
        }

        private Session getOrCreateSession(HttpServerExchange exchange) {
            SessionManager sessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
            SessionConfig sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
            def session = sessionManager.getSession(exchange, sessionConfig)
            if (!session) {
                session = sessionManager.createSession(exchange, sessionConfig)
                LOG.info("Creating HTTP session. Username: ${determineUsername(exchange)}")
            }
            return session

        }
    }
}