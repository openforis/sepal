package test;

import io.undertow.Handlers;
import io.undertow.Undertow;
import io.undertow.server.HttpHandler;
import io.undertow.server.handlers.PathHandler;
import io.undertow.server.handlers.ResponseCodeHandler;
import io.undertow.server.handlers.proxy.SimpleProxyClientProvider;
import org.apache.http.HttpResponse;
import org.apache.http.client.HttpClient;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.HttpClientBuilder;
import org.junit.After;
import org.junit.Test;
import org.openforis.sepal.undertow.PatchedProxyHandler;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class UndertowProxyTest {
    private final TargetServer targetServer = new TargetServer();
    private final ProxyServer proxyServer = new ProxyServer(targetServer.uri);

    @After
    public void cleanup() {
        targetServer.stop();
        proxyServer.stop();
    }

    @Test
    public void prefix_root_to_root() throws Exception {
        proxyServer.proxyPrefixPath("/", "/");
        isProxied("", "/");
        isProxied("/", "/");
        isProxied("/foo", "/foo");
    }

    @Test
    public void prefix_root_to_path() throws Exception {
        proxyServer.proxyPrefixPath("/", "/path");
        isProxied("", "/path/");
        isProxied("/", "/path/");
        isProxied("/foo", "/path/foo");
    }

    @Test
    public void prefix_path_to_path() throws Exception {
        proxyServer.proxyPrefixPath("/path", "/path");
        isProxied("/path", "/path");
        isProxied("/path/", "/path/");
        isProxied("/path/foo", "/path/foo");
        isNotProxied("");
        isNotProxied("/");
        isNotProxied("/foo");
    }

    @Test
    public void prefix_path_to_root() throws Exception {
        proxyServer.proxyPrefixPath("/path", "/");
        isProxied("/path", "/");
        isProxied("/path/", "/");
        isNotProxied("");
        isNotProxied("/");
        isNotProxied("/foo");
    }

    @Test
    public void prefix_path_slash_to_root() throws Exception {
        proxyServer.proxyPrefixPath("/path/", "/");
        isProxied("/path", "/");
        isProxied("/path/", "/");
        isNotProxied("");
        isNotProxied("/");
        isNotProxied("/foo");
    }

    @Test
    public void exact_root_to_root() throws Exception {
        proxyServer.proxyExactPath("/", "/");
        isProxied("", "/");
        isProxied("/", "/");
        isNotProxied("/foo");
    }

    @Test
    public void exact_root_to_path() throws Exception {
        proxyServer.proxyExactPath("/", "/path");
        isProxied("", "/path");
        isProxied("/", "/path");
        isNotProxied("/foo");
    }

    @Test
    public void exact_root_to_path_slash() throws Exception {
        proxyServer.proxyExactPath("/", "/path/");
        isProxied("", "/path/");
        isProxied("/", "/path/");
        isNotProxied("/foo");
    }

    @Test
    public void exact_path_to_root() throws Exception {
        proxyServer.proxyExactPath("/path", "/");
        isProxied("/path", "/");
        isProxied("/path/", "/");
        isNotProxied("");
        isNotProxied("/");
        isNotProxied("/foo");
        isNotProxied("/path/foo");
    }

    @Test
    public void exact_path_slash_to_root() throws Exception {
        proxyServer.proxyExactPath("/path/", "/");
        isProxied("/path", "/");
        isProxied("/path/", "/");
        isNotProxied("");
        isNotProxied("/");
        isNotProxied("/foo");
        isNotProxied("/path/foo");
    }

    @Test
    public void exact_path_to_path() throws Exception {
        proxyServer.proxyExactPath("/path", "/path");
        isProxied("/path", "/path");
        isProxied("/path/", "/path");
        isNotProxied("");
        isNotProxied("/");
        isNotProxied("/foo");
        isNotProxied("/path/foo");
    }

    @Test
    public void exact_path_to_path_slash() throws Exception {
        proxyServer.proxyExactPath("/path", "/path/");
        isProxied("/path", "/path/");
        isProxied("/path/", "/path/");
        isNotProxied("");
        isNotProxied("/");
        isNotProxied("/foo");
        isNotProxied("/path/foo");
    }

    private void isProxied(String requestPath, String expectedTargetPath) throws IOException {
        assertEquals(200, httpGet(requestPath));
        assertEquals(expectedTargetPath, targetServer.gotRequest());
    }

    private void isNotProxied(String requestPath) throws IOException {
        assertEquals(404, httpGet(requestPath));
        assertNull(targetServer.gotRequest());
    }

    private int httpGet(String path) throws IOException {
        HttpClient http = HttpClientBuilder.create().build();
        HttpResponse response = http.execute(new HttpGet(proxyServer.uri + path));
        return response.getStatusLine().getStatusCode();
    }

    private static class ProxyServer {
        private final int port = FreePort.find();
        private final Undertow server;
        private final PathHandler pathHandler = Handlers.path();
        final String uri = "http://localhost:" + port;
        private final String targetUri;

        ProxyServer(String targetUri) {
            this.targetUri = targetUri;
            server = Undertow.builder()
                    .addHttpListener(port, "0.0.0.0")
                    .setHandler(pathHandler)
                    .build();
            server.start();
        }

        void proxyPrefixPath(String proxyPath, String targetPath) {
            pathHandler.addPrefixPath(proxyPath, proxyHandler(targetPath));
        }

        void proxyExactPath(String proxyPath, String targetPath) {
            pathHandler.addExactPath(proxyPath, proxyHandler(targetPath));
        }

        void stop() {
            server.stop();
        }

        private HttpHandler proxyHandler(String targetPath) {
            return new PatchedProxyHandler(
                    new SimpleProxyClientProvider(URI.create(targetUri + targetPath)),
                    ResponseCodeHandler.HANDLE_404);
        }
    }

    private static class TargetServer {
        private final int port = FreePort.find();
        private final Undertow server;
        final String uri = "http://localhost:" + port;

        private String gotRequest;

        TargetServer() {
            server = Undertow.builder()
                    .addHttpListener(port, "0.0.0.0")
                    .setHandler(exchange -> gotRequest = URI.create(exchange.getRequestURL()).getPath())
                    .build();
            server.start();
        }

        void stop() {
            server.stop();
        }

        String gotRequest() {
            String url = gotRequest;
            gotRequest = null; // Reset
            return url;
        }
    }

    private static class FreePort {
        static int find() {
            int port = 0;
            while (port <= 0) {
                ServerSocket socket = null;
                try {
                    socket = new ServerSocket(0);
                    port = socket.getLocalPort();
                } catch (IOException e) {
                    throw new RuntimeException("Failed finding free port", e);
                } finally {
                    try {
                        if (socket != null) socket.close();
                    } catch (IOException ignore) {
                    }
                }
            }
            return port;
        }
    }
}
