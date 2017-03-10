package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.UndertowOptions
import io.undertow.client.ClientCallback
import io.undertow.client.ClientConnection
import io.undertow.client.UndertowClient
import io.undertow.server.ExchangeCompletionListener
import io.undertow.server.HttpServerExchange
import io.undertow.server.handlers.proxy.ProxyCallback
import io.undertow.server.handlers.proxy.ProxyClient
import io.undertow.server.handlers.proxy.ProxyConnection
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.xnio.ChannelListener
import org.xnio.IoUtils
import org.xnio.OptionMap

import java.nio.channels.Channel
import java.util.concurrent.TimeUnit

class SandboxProxyClient implements ProxyClient {
    private static final Logger LOG = LoggerFactory.getLogger(SandboxProxyClient.class)
    private static final CONNECTION_TIMEOUT_MILLIS = 10000
    private final UriProvider uriProvider
    private final UndertowClient client;

    SandboxProxyClient(UriProvider uriProvider) {
        this.uriProvider = uriProvider
        this.client = UndertowClient.getInstance()
    }

    ProxyClient.ProxyTarget findTarget(HttpServerExchange exchange) {
//        exchange.persistent = false // Make sure connections are closed
        def uri = uriProvider.provide(exchange)
        LOG.debug("[SandboxWebProxy] Found target: uri: $uri, exchange: $exchange")
        new UriHoldingTarget(uri)
    }

    void getConnection(ProxyClient.ProxyTarget target, HttpServerExchange exchange,
                       final ProxyCallback<ProxyConnection> callback, long timeout, TimeUnit timeUnit) {
        def uri = ((UriHoldingTarget) target).uri
        LOG.debug("[SandboxWebProxy] Connecting to sandbox. uri: $uri, exchange: $exchange")
        client.connect( // We never try to reuse a connection, always create a new
                new ConnectionListener(uri, callback, exchange),
                uri,
                exchange.getIoThread(),
                exchange.getConnection().getByteBufferPool(),
                OptionMap.create(UndertowOptions.IDLE_TIMEOUT, CONNECTION_TIMEOUT_MILLIS))
    }

    private static class UriHoldingTarget implements ProxyClient.ProxyTarget {
        final URI uri

        UriHoldingTarget(URI uri) {
            this.uri = uri
        }
    }

    private static class ConnectionListener implements ClientCallback<ClientConnection> {
        private final Logger LOG = LoggerFactory.getLogger(ConnectionListener.class)
        private final URI uri
        private final ProxyCallback<ProxyConnection> callback
        private final HttpServerExchange exchange

        private ConnectionListener(URI uri, ProxyCallback<ProxyConnection> callback, HttpServerExchange exchange) {
            this.uri = uri
            this.callback = callback
            this.exchange = exchange
        }

        void completed(final ClientConnection connection) {
            LOG.debug("[SandboxWebProxy] Client connection established. uri: $uri, exchange: $exchange")
            exchange.addExchangeCompleteListener(new ExchangeCompletionListener() {
                void exchangeEvent(HttpServerExchange exchange, ExchangeCompletionListener.NextListener nextListener) {
                    LOG.debug("[SandboxWebProxy] Exchange completed. uri: $uri, exchange: $exchange")
                    IoUtils.safeClose(connection)
                    nextListener.proceed()
                }
            })
            connection.getCloseSetter().set(new ChannelListener<Channel>() {
                void handleEvent(Channel channel) {
                    if (!connection.isOpen())
                        LOG.debug("[SandboxWebProxy] Client connection closed. uri: $uri, exchange: $exchange")
                }
            })
            callback.completed(exchange, new ProxyConnection(connection, uri.getPath() == null ? "/" : uri.getPath()))
        }

        void failed(IOException e) {
            LOG.error("[SandboxWebProxy] Client connection failed. uri: $uri, exchange: $exchange", e)
            callback.failed(exchange)
        }
    }
}
