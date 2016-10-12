package org.openforis.sepal.undertow;


import io.undertow.UndertowLogger;
import io.undertow.attribute.ExchangeAttribute;
import io.undertow.client.*;
import io.undertow.io.IoCallback;
import io.undertow.io.Sender;
import io.undertow.server.HttpHandler;
import io.undertow.server.HttpServerExchange;
import io.undertow.server.RenegotiationRequiredException;
import io.undertow.server.SSLSessionInfo;
import io.undertow.server.handlers.proxy.ProxyCallback;
import io.undertow.server.handlers.proxy.ProxyClient;
import io.undertow.server.handlers.proxy.ProxyConnection;
import io.undertow.server.protocol.http.HttpAttachments;
import io.undertow.server.protocol.http.HttpContinue;
import io.undertow.util.*;
import org.jboss.logging.Logger;
import org.xnio.*;
import org.xnio.channels.StreamSinkChannel;

import javax.net.ssl.SSLPeerUnverifiedException;
import javax.security.cert.CertificateEncodingException;
import javax.security.cert.X509Certificate;
import java.io.Closeable;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.SocketAddress;
import java.nio.channels.Channel;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static io.undertow.util.NetworkUtils.formatPossibleIpv6Address;
import static org.xnio.ChannelListeners.*;

/**
 * An HTTP handler which proxies content to a remote server.
 * <p>
 * This handler acts like a filter. The {@link ProxyClient} has a chance to decide if it
 * knows how to proxy the request. If it does then it will provide a connection that can
 * used to connect to the remote server, otherwise the next handler will be invoked and the
 * request will proceed as normal.
 *
 * @author <a href="mailto:david.lloyd@redhat.com">David M. Lloyd</a>
 */
public final class PatchedProxyHandler implements HttpHandler {

    private static final int DEFAULT_MAX_RETRY_ATTEMPTS = Integer.getInteger("io.undertow.server.handlers.proxy.maxRetries", 1);

    private static final Logger log = Logger.getLogger(PatchedProxyHandler.class.getPackage().getName());

    private final ProxyClient proxyClient;
    private final int maxRequestTime;

    private static final AttachmentKey<ProxyConnection> CONNECTION = AttachmentKey.create(ProxyConnection.class);
    private static final AttachmentKey<HttpServerExchange> EXCHANGE = AttachmentKey.create(HttpServerExchange.class);
    private static final AttachmentKey<XnioExecutor.Key> TIMEOUT_KEY = AttachmentKey.create(XnioExecutor.Key.class);

    /**
     * Map of additional headers to add to the request.
     */
    private final Map<HttpString, ExchangeAttribute> requestHeaders = new CopyOnWriteMap<>();

    private final HttpHandler next;

    private final boolean rewriteHostHeader;
    private final boolean reuseXForwarded;
    private final int maxConnectionRetries;

    private ClientResponseListener clientResponseListener;

    private PatchedProxyHandler(ProxyClient proxyClient, int maxRequestTime, HttpHandler next) {
        this(proxyClient, maxRequestTime, next, false, false);
    }

    /**
     * @param proxyClient       the client to use to make the proxy call
     * @param maxRequestTime    the maximum amount of time to allow the request to be processed
     * @param next              the next handler in line
     * @param rewriteHostHeader should the HOST header be rewritten to use the target host of the call.
     * @param reuseXForwarded   should any existing X-Forwarded-For header be used or should it be overwritten.
     */
    private PatchedProxyHandler(
            ProxyClient proxyClient,
            int maxRequestTime,
            HttpHandler next,
            boolean rewriteHostHeader,
            boolean reuseXForwarded) {
        this(proxyClient, maxRequestTime, next, rewriteHostHeader, reuseXForwarded, DEFAULT_MAX_RETRY_ATTEMPTS);
    }

    /**
     * @param proxyClient       the client to use to make the proxy call
     * @param maxRequestTime    the maximum amount of time to allow the request to be processed
     * @param next              the next handler in line
     * @param rewriteHostHeader should the HOST header be rewritten to use the target host of the call.
     * @param reuseXForwarded   should any existing X-Forwarded-For header be used or should it be overwritten.
     */
    private PatchedProxyHandler(
            ProxyClient proxyClient,
            int maxRequestTime,
            HttpHandler next,
            boolean rewriteHostHeader,
            boolean reuseXForwarded,
            int maxConnectionRetries) {
        this.proxyClient = proxyClient;
        this.maxRequestTime = maxRequestTime;
        this.next = next;
        this.rewriteHostHeader = rewriteHostHeader;
        this.reuseXForwarded = reuseXForwarded;
        this.maxConnectionRetries = maxConnectionRetries;
    }


    public PatchedProxyHandler(ProxyClient proxyClient, HttpHandler next) {
        this(proxyClient, -1, next);
    }


    public void setClientResponseListener(ClientResponseListener clientResponseListener) {
        this.clientResponseListener = clientResponseListener;
    }

    public void handleRequest(final HttpServerExchange exchange) throws Exception {
        final ProxyClient.ProxyTarget target = proxyClient.findTarget(exchange);
        if (target == null) {
            log.debugf("No proxy target for request to %s", exchange.getRequestURL());
            next.handleRequest(exchange);
            return;
        }
        final long timeout = maxRequestTime > 0 ? System.currentTimeMillis() + maxRequestTime : 0;
        final ProxyClientHandler clientHandler = new ProxyClientHandler(exchange, target, timeout, maxConnectionRetries);
        if (timeout > 0) {
            final XnioExecutor.Key key = exchange.getIoThread().executeAfter(() ->
                    clientHandler.cancel(exchange), maxRequestTime, TimeUnit.MILLISECONDS);
            exchange.putAttachment(TIMEOUT_KEY, key);
            exchange.addExchangeCompleteListener((exchange1, nextListener) -> {
                key.remove();
                nextListener.proceed();
            });
        }
        exchange.dispatch(exchange.isInIoThread() ? SameThreadExecutor.INSTANCE : exchange.getIoThread(), clientHandler);
    }


    static void copyHeaders(final HeaderMap to, final HeaderMap from) {
        long f = from.fastIterateNonEmpty();
        HeaderValues values;
        while (f != -1L) {
            values = from.fiCurrent(f);
            if (!to.contains(values.getHeaderName())) {
                //don't over write existing headers, normally the map will be empty, if it is not we assume it is not for a reason
                to.putAll(values.getHeaderName(), values);
            }
            f = from.fiNextNonEmpty(f);
        }
    }

    private final class ProxyClientHandler implements ProxyCallback<ProxyConnection>, Runnable {

        private int tries;

        private final long timeout;
        private final int maxRetryAttempts;
        private final HttpServerExchange exchange;
        private ProxyClient.ProxyTarget target;

        ProxyClientHandler(HttpServerExchange exchange, ProxyClient.ProxyTarget target, long timeout, int maxRetryAttempts) {
            this.exchange = exchange;
            this.timeout = timeout;
            this.maxRetryAttempts = maxRetryAttempts;
            this.target = target;
        }

        @Override
        public void run() {
            proxyClient.getConnection(target, exchange, this, -1, TimeUnit.MILLISECONDS);
        }

        @Override
        public void completed(final HttpServerExchange exchange, final ProxyConnection connection) {
            exchange.putAttachment(CONNECTION, connection);
            exchange.dispatch(SameThreadExecutor.INSTANCE, new ProxyAction(
                    connection,
                    exchange,
                    requestHeaders,
                    rewriteHostHeader,
                    reuseXForwarded,
                    clientResponseListener));
        }

        @Override
        public void failed(final HttpServerExchange exchange) {
            final long time = System.currentTimeMillis();
            if (tries++ < maxRetryAttempts) {
                if (timeout > 0 && time > timeout) {
                    cancel(exchange);
                } else {
                    target = proxyClient.findTarget(exchange);
                    if (target != null) {
                        final long remaining = timeout > 0 ? timeout - time : -1;
                        proxyClient.getConnection(target, exchange, this, remaining, TimeUnit.MILLISECONDS);
                    } else {
                        couldNotResolveBackend(exchange); // The context was registered when we started, so return 503
                    }
                }
            } else {
                couldNotResolveBackend(exchange);
            }
        }

        @Override
        public void queuedRequestFailed(HttpServerExchange exchange) {
            failed(exchange);
        }

        @Override
        public void couldNotResolveBackend(HttpServerExchange exchange) {
            if (exchange.isResponseStarted()) {
                IoUtils.safeClose(exchange.getConnection());
            } else {
                exchange.setStatusCode(StatusCodes.SERVICE_UNAVAILABLE);
                exchange.endExchange();
            }
        }

        void cancel(final HttpServerExchange exchange) {
            final ProxyConnection connectionAttachment = exchange.getAttachment(CONNECTION);
            if (connectionAttachment != null) {
                ClientConnection clientConnection = connectionAttachment.getConnection();
                UndertowLogger.PROXY_REQUEST_LOGGER.timingOutRequest(clientConnection.getPeerAddress()
                        + "" + exchange.getRequestURI());
                IoUtils.safeClose(clientConnection);
            } else {
                UndertowLogger.PROXY_REQUEST_LOGGER.timingOutRequest(exchange.getRequestURI());
            }
            if (exchange.isResponseStarted()) {
                IoUtils.safeClose(exchange.getConnection());
            } else {
                exchange.setStatusCode(StatusCodes.SERVICE_UNAVAILABLE);
                exchange.endExchange();
            }
        }

    }

    private static class ProxyAction implements Runnable {
        private final ProxyConnection clientConnection;
        private final HttpServerExchange exchange;
        private final Map<HttpString, ExchangeAttribute> requestHeaders;
        private final boolean rewriteHostHeader;
        private final boolean reuseXForwarded;
        private final ClientResponseListener clientResponseListener;

        ProxyAction(
                final ProxyConnection clientConnection,
                final HttpServerExchange exchange, Map<HttpString, ExchangeAttribute> requestHeaders,
                boolean rewriteHostHeader,
                boolean reuseXForwarded,
                ClientResponseListener clientResponseListener) {
            this.clientConnection = clientConnection;
            this.exchange = exchange;
            this.requestHeaders = requestHeaders;
            this.rewriteHostHeader = rewriteHostHeader;
            this.reuseXForwarded = reuseXForwarded;
            this.clientResponseListener = clientResponseListener;
        }

        @Override
        public void run() {
            final ClientRequest request = new ClientRequest();

            String targetURI = exchange.getRequestURI();
            if (exchange.isHostIncludedInRequestURI()) {
                int uriPart = targetURI.indexOf("//");
                if (uriPart != -1) {
                    uriPart = targetURI.indexOf("/", uriPart);
                    targetURI = targetURI.substring(uriPart);
                }
            }

            if (!exchange.getResolvedPath().isEmpty() && targetURI.startsWith(exchange.getResolvedPath())) {
                targetURI = targetURI.substring(exchange.getResolvedPath().length());
            }

            StringBuilder requestURI = new StringBuilder();
            if (!clientConnection.getTargetPath().isEmpty()
                    && (!clientConnection.getTargetPath().equals("/") || targetURI.isEmpty())) {
                requestURI.append(clientConnection.getTargetPath());
            }
            requestURI.append(targetURI);
            if (requestURI.length() == 0)
                requestURI.append('/');
            String qs = exchange.getQueryString();
            if (qs != null && !qs.isEmpty()) {
                requestURI.append('?');
                requestURI.append(qs);
            }
            request.setPath(requestURI.toString())
                    .setMethod(exchange.getRequestMethod());
            final HeaderMap inboundRequestHeaders = exchange.getRequestHeaders();
            final HeaderMap outboundRequestHeaders = request.getRequestHeaders();
            copyHeaders(outboundRequestHeaders, inboundRequestHeaders);

            if (!exchange.isPersistent()) {
                //just because the client side is non-persistent
                //we don't want to close the connection to the backend
                outboundRequestHeaders.put(Headers.CONNECTION, "keep-alive");
            }
            if ("h2c".equals(exchange.getRequestHeaders().getFirst(Headers.UPGRADE))) {
                //we don't allow h2c upgrade requests to be passed through to the backend
                exchange.getRequestHeaders().remove(Headers.UPGRADE);
                outboundRequestHeaders.put(Headers.CONNECTION, "keep-alive");
            }

            for (Map.Entry<HttpString, ExchangeAttribute> entry : requestHeaders.entrySet()) {
                String headerValue = entry.getValue().readAttribute(exchange);
                if (headerValue == null || headerValue.isEmpty()) {
                    outboundRequestHeaders.remove(entry.getKey());
                } else {
                    outboundRequestHeaders.put(entry.getKey(), headerValue.replace('\n', ' '));
                }
            }

            final SocketAddress address = exchange.getConnection().getPeerAddress();
            final String remoteHost = (address != null && address instanceof InetSocketAddress)
                    ? ((InetSocketAddress) address).getHostString()
                    : "localhost";
            request.putAttachment(ProxiedRequestAttachments.REMOTE_HOST, remoteHost);

            if (reuseXForwarded && request.getRequestHeaders().contains(Headers.X_FORWARDED_FOR)) {
                // We have an existing header so we shall simply append the host to the existing list
                final String current = request.getRequestHeaders().getFirst(Headers.X_FORWARDED_FOR);
                if (current == null || current.isEmpty()) {
                    // It was empty so just add it
                    request.getRequestHeaders().put(Headers.X_FORWARDED_FOR, remoteHost);
                } else {
                    // Add the new entry and reset the existing header
                    request.getRequestHeaders().put(Headers.X_FORWARDED_FOR, current + "," + remoteHost);
                }
            } else {
                // No existing header or not allowed to reuse the header so set it here
                request.getRequestHeaders().put(Headers.X_FORWARDED_FOR, remoteHost);
            }

            //if we don't support push set a header saying so
            //this is non standard, and a problem with the HTTP2 spec, but they did not want to listen
            if (!exchange.getConnection().isPushSupported() && clientConnection.getConnection().isPushSupported()) {
                request.getRequestHeaders().put(Headers.X_DISABLE_PUSH, "true");
            }

            // Set the protocol header and attachment
            if (reuseXForwarded && exchange.getRequestHeaders().contains(Headers.X_FORWARDED_PROTO)) {
                final String proto = exchange.getRequestHeaders().getFirst(Headers.X_FORWARDED_PROTO);
                request.putAttachment(ProxiedRequestAttachments.IS_SSL, proto.equals("https"));
            } else {
                final String proto = exchange.getRequestScheme().equals("https") ? "https" : "http";
                request.getRequestHeaders().put(Headers.X_FORWARDED_PROTO, proto);
                request.putAttachment(ProxiedRequestAttachments.IS_SSL, proto.equals("https"));
            }

            // Set the server name
            if (reuseXForwarded && exchange.getRequestHeaders().contains(Headers.X_FORWARDED_SERVER)) {
                final String hostName = exchange.getRequestHeaders().getFirst(Headers.X_FORWARDED_SERVER);
                request.putAttachment(ProxiedRequestAttachments.SERVER_NAME, hostName);
            } else {
                final String hostName = exchange.getHostName();
                request.getRequestHeaders().put(Headers.X_FORWARDED_SERVER, hostName);
                request.putAttachment(ProxiedRequestAttachments.SERVER_NAME, hostName);
            }
            if (!exchange.getRequestHeaders().contains(Headers.X_FORWARDED_HOST)) {
                final String hostName = exchange.getHostName();
                if (hostName != null) {
                    request.getRequestHeaders().put(Headers.X_FORWARDED_HOST, formatPossibleIpv6Address(hostName));
                }
            }

            // Set the port
            if (reuseXForwarded && exchange.getRequestHeaders().contains(Headers.X_FORWARDED_PORT)) {
                try {
                    int port = Integer.parseInt(exchange.getRequestHeaders().getFirst(Headers.X_FORWARDED_PORT));
                    request.putAttachment(ProxiedRequestAttachments.SERVER_PORT, port);
                } catch (NumberFormatException e) {
                    int port = exchange.getConnection().getLocalAddress(InetSocketAddress.class).getPort();
                    request.getRequestHeaders().put(Headers.X_FORWARDED_PORT, port);
                    request.putAttachment(ProxiedRequestAttachments.SERVER_PORT, port);
                }
            } else {
                int port = exchange.getHostPort();
                request.getRequestHeaders().put(Headers.X_FORWARDED_PORT, port);
                request.putAttachment(ProxiedRequestAttachments.SERVER_PORT, port);
            }

            SSLSessionInfo sslSessionInfo = exchange.getConnection().getSslSessionInfo();
            if (sslSessionInfo != null) {
                X509Certificate[] peerCertificates;
                try {
                    peerCertificates = sslSessionInfo.getPeerCertificateChain();
                    if (peerCertificates.length > 0) {
                        request.putAttachment(ProxiedRequestAttachments.SSL_CERT, Certificates.toPem(peerCertificates[0]));
                    }
                } catch (SSLPeerUnverifiedException | CertificateEncodingException | RenegotiationRequiredException e) {
                    //ignore
                }
                request.putAttachment(ProxiedRequestAttachments.SSL_CYPHER, sslSessionInfo.getCipherSuite());
                request.putAttachment(ProxiedRequestAttachments.SSL_SESSION_ID, sslSessionInfo.getSessionId());
            }

            if (rewriteHostHeader) {
                InetSocketAddress targetAddress = clientConnection.getConnection().getPeerAddress(InetSocketAddress.class);
                request.getRequestHeaders().put(Headers.HOST, targetAddress.getHostString() + ":" + targetAddress.getPort());
                request.getRequestHeaders().put(Headers.X_FORWARDED_HOST, exchange.getRequestHeaders().getFirst(Headers.HOST));
            }
            if (log.isDebugEnabled()) {
                log.debugf("Sending request %s to target %s for exchange %s", request, remoteHost, exchange);
            }
            clientConnection.getConnection().sendRequest(request, new ClientCallback<ClientExchange>() {
                @Override
                public void completed(final ClientExchange result) {

                    if (log.isDebugEnabled()) {
                        log.debugf("Sent request %s to target %s for exchange %s", request, remoteHost, exchange);
                    }
                    result.putAttachment(EXCHANGE, exchange);

                    boolean requiresContinueResponse = HttpContinue.requiresContinueResponse(exchange);
                    if (requiresContinueResponse) {
                        result.setContinueHandler(clientExchange -> {
                            if (log.isDebugEnabled()) {
                                log.debugf("Relieved continue response to request %s to target %s for exchange %s",
                                        request, remoteHost, exchange);
                            }
                            HttpContinue.sendContinueResponse(exchange, new IoCallback() {
                                @Override
                                public void onComplete(final HttpServerExchange exchange, final Sender sender) {
                                    //don't care
                                }

                                @Override
                                public void onException(
                                        final HttpServerExchange exchange,
                                        final Sender sender,
                                        final IOException exception) {
                                    IoUtils.safeClose(clientConnection.getConnection());
                                    exchange.endExchange();
                                    UndertowLogger.REQUEST_IO_LOGGER.ioException(exception);
                                }
                            });
                        });
                    }

                    //handle server push
                    if (exchange.getConnection().isPushSupported() && result.getConnection().isPushSupported()) {
                        result.setPushHandler((originalRequest, pushedRequest) -> {

                            if (log.isDebugEnabled()) {
                                log.debugf("Sending push request %s received from %s to target %s for exchange %s",
                                        pushedRequest.getRequest(), request, remoteHost, exchange);
                            }
                            final ClientRequest request1 = pushedRequest.getRequest();
                            exchange.getConnection().pushResource(
                                    request1.getPath(),
                                    request1.getMethod(),
                                    request1.getRequestHeaders(),
                                    exchange -> {
                                        String path = request1.getPath();
                                        int i = path.indexOf("?");
                                        if (i > 0) {
                                            path = path.substring(0, i);
                                        }

                                        exchange.dispatch(SameThreadExecutor.INSTANCE,
                                                new ProxyAction(
                                                        new ProxyConnection(pushedRequest.getConnection(), path),
                                                        exchange,
                                                        requestHeaders,
                                                        rewriteHostHeader,
                                                        reuseXForwarded,
                                                        clientResponseListener));
                                    });
                            return true;
                        });
                    }


                    result.setResponseListener(new ResponseCallback(clientResponseListener, exchange));
                    final IoExceptionHandler handler = new IoExceptionHandler(exchange, clientConnection.getConnection());
                    if (requiresContinueResponse) {
                        try {
                            if (!result.getRequestChannel().flush()) {
                                result.getRequestChannel().getWriteSetter().set(
                                        flushingChannelListener(
                                                (ChannelListener<StreamSinkChannel>) channel ->
                                                        Transfer.initiateTransfer(
                                                                exchange.getRequestChannel(),
                                                                result.getRequestChannel(),
                                                                closingChannelListener(),
                                                                new HTTPTrailerChannelListener(exchange, result),
                                                                handler, handler,
                                                                exchange.getConnection().getByteBufferPool()),
                                                handler));
                                result.getRequestChannel().resumeWrites();
                                return;
                            }
                        } catch (IOException e) {
                            handler.handleException(result.getRequestChannel(), e);
                        }
                    }
                    Transfer.initiateTransfer(
                            exchange.getRequestChannel(),
                            result.getRequestChannel(),
                            closingChannelListener(),
                            new HTTPTrailerChannelListener(exchange, result),
                            handler,
                            handler,
                            exchange.getConnection().getByteBufferPool());

                }

                @Override
                public void failed(IOException e) {
                    UndertowLogger.PROXY_REQUEST_LOGGER.proxyRequestFailed(exchange.getRequestURI(), e);
                    if (!exchange.isResponseStarted()) {
                        exchange.setStatusCode(StatusCodes.SERVICE_UNAVAILABLE);
                        exchange.endExchange();
                    } else {
                        IoUtils.safeClose(exchange.getConnection());
                    }
                }
            });


        }
    }

    private static final class ResponseCallback implements ClientCallback<ClientExchange> {

        private final ClientResponseListener listener;
        private final HttpServerExchange exchange;

        private ResponseCallback(ClientResponseListener listener, HttpServerExchange exchange) {
            this.listener = listener;
            this.exchange = exchange;
        }

        @Override
        public void completed(final ClientExchange result) {

            final ClientResponse response = result.getResponse();

            if (log.isDebugEnabled()) {
                log.debugf("Received response %s for request %s for exchange %s", response, result.getRequest(), exchange);
            }

            if (listener != null) {
                listener.completed(result.getResponse(), exchange);
            }

            final HeaderMap inboundResponseHeaders = response.getResponseHeaders();
            final HeaderMap outboundResponseHeaders = exchange.getResponseHeaders();

            exchange.setStatusCode(response.getResponseCode());
            copyHeaders(outboundResponseHeaders, inboundResponseHeaders);

            if (exchange.isUpgrade()) {

                exchange.upgradeChannel((streamConnection, exchange) -> {

                    if (log.isDebugEnabled()) {
                        log.debugf("Upgraded request %s to for exchange %s", result.getRequest(), exchange);
                    }
                    StreamConnection clientChannel;
                    try {
                        clientChannel = result.getConnection().performUpgrade();

                        final ClosingExceptionHandler handler = new ClosingExceptionHandler(streamConnection, clientChannel);
                        Transfer.initiateTransfer(
                                clientChannel.getSourceChannel(),
                                streamConnection.getSinkChannel(),
                                closingChannelListener(),
                                writeShutdownChannelListener(
                                        ChannelListeners.<StreamSinkChannel>flushingChannelListener(
                                                closingChannelListener(),
                                                closingChannelExceptionHandler()),
                                        closingChannelExceptionHandler()),
                                handler,
                                handler,
                                result.getConnection().getBufferPool());
                        Transfer.initiateTransfer(
                                streamConnection.getSourceChannel(),
                                clientChannel.getSinkChannel(),
                                closingChannelListener(),
                                writeShutdownChannelListener(
                                        ChannelListeners.<StreamSinkChannel>flushingChannelListener(
                                                closingChannelListener(),
                                                closingChannelExceptionHandler()),
                                        closingChannelExceptionHandler()),
                                handler,
                                handler,
                                result.getConnection().getBufferPool());

                    } catch (IOException e) {
                        IoUtils.safeClose(streamConnection);
                    }
                });
            }
            final IoExceptionHandler handler = new IoExceptionHandler(exchange, result.getConnection());
            Transfer.initiateTransfer(
                    result.getResponseChannel(),
                    exchange.getResponseChannel(),
                    closingChannelListener(),
                    new HTTPTrailerChannelListener(result, exchange),
                    handler,
                    handler,
                    exchange.getConnection().getByteBufferPool());
        }

        @Override
        public void failed(IOException e) {
            UndertowLogger.PROXY_REQUEST_LOGGER.proxyRequestFailed(exchange.getRequestURI(), e);

            if (listener != null) {
                listener.failed(e, exchange);
            }

            if (!exchange.isResponseStarted()) {
                exchange.setStatusCode(StatusCodes.INTERNAL_SERVER_ERROR);
                exchange.endExchange();
            } else {
                IoUtils.safeClose(exchange.getConnection());
            }
        }
    }

    private static final class HTTPTrailerChannelListener implements ChannelListener<StreamSinkChannel> {

        private final Attachable source;
        private final Attachable target;

        private HTTPTrailerChannelListener(final Attachable source, final Attachable target) {
            this.source = source;
            this.target = target;
        }

        @Override
        public void handleEvent(final StreamSinkChannel channel) {
            HeaderMap trailers = source.getAttachment(HttpAttachments.REQUEST_TRAILERS);
            if (trailers != null) {
                target.putAttachment(HttpAttachments.RESPONSE_TRAILERS, trailers);
            }
            try {
                channel.shutdownWrites();
                if (!channel.flush()) {
                    channel.getWriteSetter().set(flushingChannelListener(
                            (ChannelListener<StreamSinkChannel>) channel1 -> {
                                channel1.suspendWrites();
                                channel1.getWriteSetter().set(null);
                            }, closingChannelExceptionHandler()));
                    channel.resumeWrites();
                } else {
                    channel.getWriteSetter().set(null);
                    channel.shutdownWrites();
                }
            } catch (IOException e) {
                UndertowLogger.REQUEST_IO_LOGGER.ioException(e);
                IoUtils.safeClose(channel);
            } catch (Exception e) {
                UndertowLogger.REQUEST_IO_LOGGER.ioException(new IOException(e));
                IoUtils.safeClose(channel);
            }

        }
    }

    private static final class IoExceptionHandler implements ChannelExceptionHandler<Channel> {

        private final HttpServerExchange exchange;
        private final ClientConnection clientConnection;

        private IoExceptionHandler(HttpServerExchange exchange, ClientConnection clientConnection) {
            this.exchange = exchange;
            this.clientConnection = clientConnection;
        }

        @Override
        public void handleException(Channel channel, IOException exception) {
            IoUtils.safeClose(channel);
            IoUtils.safeClose(clientConnection);
            if (exchange.isResponseStarted()) {
                UndertowLogger.REQUEST_IO_LOGGER.debug("Exception reading from target server", exception);
                if (!exchange.isResponseStarted()) {
                    exchange.setStatusCode(StatusCodes.INTERNAL_SERVER_ERROR);
                    exchange.endExchange();
                } else {
                    IoUtils.safeClose(exchange.getConnection());
                }
            } else {
                UndertowLogger.REQUEST_IO_LOGGER.ioException(exception);
                exchange.setStatusCode(StatusCodes.INTERNAL_SERVER_ERROR);
                exchange.endExchange();
            }
        }
    }

    private static final class ClosingExceptionHandler implements ChannelExceptionHandler<Channel> {

        private final Closeable[] toClose;

        private ClosingExceptionHandler(Closeable... toClose) {
            this.toClose = toClose;
        }


        @Override
        public void handleException(Channel channel, IOException exception) {
            IoUtils.safeClose(channel);
            IoUtils.safeClose(toClose);
        }
    }

    public interface ClientResponseListener {

        void completed(ClientResponse response, HttpServerExchange exchange);

        void failed(IOException e, HttpServerExchange exchange);
    }
}
