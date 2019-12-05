package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.HttpServerExchange
import io.undertow.server.handlers.ResponseCodeHandler
import io.undertow.server.handlers.proxy.LoadBalancingProxyClient
import org.openforis.sepal.undertow.PatchedProxyHandler
import org.xnio.OptionMap
import org.xnio.Options

class Endpoint {
    final String username
    final String name
    final URI uri
    final String sandboxSessionId
    final PatchedProxyHandler proxyHandler
    final LoadBalancingProxyClient proxyClient

    Endpoint(String name, String username, URI uri, String sandboxSessionId) {
        this.name = name
        this.username = username
        this.uri = uri
        this.sandboxSessionId = sandboxSessionId
        def options = OptionMap.builder()
            .set(Options.WRITE_TIMEOUT, 60 * 1000)
            .set(Options.KEEP_ALIVE, true)
            .getMap()
        proxyClient = new LoadBalancingProxyClient(
                maxQueueSize: 4096,
                connectionsPerThread: 20,
                softMaxConnectionsPerThread: 10
        )
        proxyClient.addHost(uri, null, null, options)
        proxyClient.ttl = 30 * 1000
        proxyHandler = new PatchedProxyHandler(
                proxyClient,
                -1,
                ResponseCodeHandler.HANDLE_404,
                false,
                false,
                3)
    }

    void forward(HttpServerExchange exchange) {
        proxyHandler.handleRequest(exchange)
    }

    void close() {
        proxyClient.removeHost(uri)
    }

    String getSandboxHost() {
        uri.host
    }

    String toString() {
        return "Endpoint{" +
                "username='" + username + '\'' +
                ", name='" + name + '\'' +
                ", uri=" + uri +
                ", sandboxSessionId='" + sandboxSessionId + '\'' +
                '}'
    }
}
