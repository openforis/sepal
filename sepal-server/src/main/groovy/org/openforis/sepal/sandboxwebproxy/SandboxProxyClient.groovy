package org.openforis.sepal.sandboxwebproxy

import io.undertow.client.ClientCallback
import io.undertow.client.ClientConnection
import io.undertow.client.UndertowClient
import io.undertow.server.HttpServerExchange
import io.undertow.server.ServerConnection
import io.undertow.server.handlers.proxy.ProxyCallback
import io.undertow.server.handlers.proxy.ProxyClient
import io.undertow.server.handlers.proxy.ProxyConnection
import io.undertow.server.session.Session
import io.undertow.server.session.SessionConfig
import io.undertow.server.session.SessionManager
import io.undertow.util.AttachmentKey
import org.openforis.sepal.sandbox.SandboxManager
import org.xnio.ChannelListener
import org.xnio.IoUtils
import org.xnio.OptionMap

import java.nio.channels.Channel
import java.util.concurrent.TimeUnit

import static io.undertow.server.handlers.proxy.ProxyClient.ProxyTarget


class SandboxProxyClient implements ProxyClient {
    private static final String PROXY_TARGET_ATTRIBUTE = 'sandbox-target'
    private final clientAttachmentKey = AttachmentKey.create(ClientConnection)
    private final Map<String, Integer> endpointByPort
    private final SandboxManager sandboxManager
    private final UndertowClient client

    SandboxProxyClient(Map<String, Integer> endpointByPort, SandboxManager sandboxManager) {
        this.endpointByPort = endpointByPort
        this.sandboxManager = sandboxManager
        client = UndertowClient.getInstance()
    }

    ProxyTarget findTarget(HttpServerExchange exchange) {
        def session = getOrCreateSession(exchange)
        return currentTarget(session) ?: initTarget(session, exchange)
    }

    private ProxyTarget currentTarget(Session session) {
        session.getAttribute(PROXY_TARGET_ATTRIBUTE) as ProxyTarget
    }

    private Session getOrCreateSession(HttpServerExchange exchange) {
        SessionManager sessionManager = exchange.getAttachment(SessionManager.ATTACHMENT_KEY)
        SessionConfig sessionConfig = exchange.getAttachment(SessionConfig.ATTACHMENT_KEY)
        def session = sessionManager.getSession(exchange, sessionConfig)
        if (session == null)
            session = sessionManager.createSession(exchange, sessionConfig)
        session
    }

    private ProxyTarget initTarget(Session session, HttpServerExchange exchange) {
        def target = new SandboxTarget(exchange, endpointByPort, sandboxManager)
        session.setAttribute(PROXY_TARGET_ATTRIBUTE, target) as ProxyTarget
        return target
    }

    void getConnection(ProxyTarget target,
                       HttpServerExchange exchange,
                       ProxyCallback<ProxyConnection> callback,
                       long timeout,
                       TimeUnit timeUnit) {
        def uri = ((SandboxTarget) target).uri
        ClientConnection existing = exchange.getConnection().getAttachment(clientAttachmentKey)
        if (existing != null) {
            if (existing.isOpen()) {
                //this connection already has a client, re-use it
                callback.completed(exchange, new ProxyConnection(existing, uri.getPath() == null ? "/" : uri.getPath()))
                return
            } else {
                exchange.getConnection().removeAttachment(clientAttachmentKey)
            }
        }
        client.connect(
                new ConnectNotifier(uri, callback, exchange),
                uri,
                exchange.getIoThread(),
                exchange.getConnection().getByteBufferPool(),
                OptionMap.EMPTY)
    }

    private class ConnectNotifier implements ClientCallback<ClientConnection> {
        private final URI uri
        private final ProxyCallback<ProxyConnection> callback
        private final HttpServerExchange exchange

        private ConnectNotifier(URI uri, ProxyCallback<ProxyConnection> callback, HttpServerExchange exchange) {
            this.uri = uri
            this.callback = callback
            this.exchange = exchange
        }

        public void completed(final ClientConnection connection) {
            final ServerConnection serverConnection = exchange.getConnection()
            //we attach to the connection so it can be re-used
            serverConnection.putAttachment(clientAttachmentKey, connection)
            serverConnection.addCloseListener(new ServerConnection.CloseListener() {
                public void closed(ServerConnection conn) {
                    IoUtils.safeClose(connection)
                }
            })
            connection.getCloseSetter().set(new ChannelListener<Channel>() {
                public void handleEvent(Channel channel) {
                    serverConnection.removeAttachment(clientAttachmentKey)
                }
            })
            callback.completed(exchange, new ProxyConnection(connection, uri.getPath() == null ? "/" : uri.getPath()))
        }

        public void failed(IOException e) {
            callback.failed(exchange)
        }
    }

    private static class SandboxTarget implements ProxyTarget {
        public final URI uri

        SandboxTarget(HttpServerExchange exchange, Map<String, Integer> endpointByPort, SandboxManager sandboxManager) {
            def endpoint = exchange.requestHeaders.getFirst('sepal-endpoint')
            def user = exchange.requestHeaders.getFirst('sepal-user')
            validateEndpoint(endpoint, endpointByPort)
            validateUser(user)
            def sandbox = sandboxManager.obtain(user) // TODO: Catch some exception here - user could be non-existing
            uri = URI.create("http://$sandbox.uri:${endpointByPort[endpoint]}")
        }

        private void validateUser(String user) {
            if (!user)
                throw new SandboxWebProxy.BadRequestException('Missing header: sepal-user')
        }

        private void validateEndpoint(String endpoint, Map<String, Integer> endpointByPort) {
            if (!endpoint)
                throw new SandboxWebProxy.BadRequestException('Missing header: sepal-endpoint')
            if (!endpointByPort.containsKey(endpoint))
                throw new SandboxWebProxy.BadRequestException("Non-existing sepal-endpoint: $endpoint")
        }
    }
}
