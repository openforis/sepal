package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.client.ClientCallback
import io.undertow.client.ClientConnection
import io.undertow.client.UndertowClient
import io.undertow.server.HttpServerExchange
import io.undertow.server.ServerConnection
import io.undertow.server.handlers.proxy.ProxyCallback
import io.undertow.server.handlers.proxy.ProxyClient
import io.undertow.server.handlers.proxy.ProxyConnection
import io.undertow.util.AttachmentKey
import org.xnio.ChannelListener
import org.xnio.IoUtils
import org.xnio.OptionMap

import java.nio.channels.Channel
import java.util.concurrent.TimeUnit

import static io.undertow.server.handlers.proxy.ProxyClient.ProxyTarget

/**
 * A client that provides connections for a proxy handler, with the connection uri determined runtime.
 */
class DynamicProxyClient implements ProxyClient {
    private final clientAttachmentKey = AttachmentKey.create(ClientConnection)
    private final UriProvider uriProvider
    private final UndertowClient client

    DynamicProxyClient(UriProvider uriProvider) {
        this.uriProvider = uriProvider
        client = UndertowClient.getInstance()
    }

    ProxyTarget findTarget(HttpServerExchange exchange) {
        new UriHoldingTarget(uriProvider.provide(exchange))
    }

    void getConnection(ProxyTarget target,
                       HttpServerExchange exchange,
                       ProxyCallback<ProxyConnection> callback,
                       long timeout,
                       TimeUnit timeUnit) {
        def uri = ((UriHoldingTarget) target).uri
        ClientConnection existing = exchange.getConnection().getAttachment(clientAttachmentKey)
        if (existing != null) {
            if (existing.isOpen() && uri.port == existing.peerAddress.port) {
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

    private static class UriHoldingTarget implements ProxyTarget {
        final URI uri

        UriHoldingTarget(URI uri) {
            this.uri = uri
        }
    }

    interface UriProvider {
        URI provide(HttpServerExchange exchange)
    }
}
