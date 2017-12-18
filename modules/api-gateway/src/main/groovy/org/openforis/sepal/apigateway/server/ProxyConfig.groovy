package org.openforis.sepal.apigateway.server

import groovy.json.JsonSlurper
import org.openforis.sepal.util.Config
import org.openforis.sepal.util.FileSystem
import org.openforis.sepal.util.annotation.ImmutableData

import static groovy.json.JsonParserType.LAX
import static java.lang.Boolean.parseBoolean

@ImmutableData(knownImmutableClasses = [File])
class ProxyConfig {
    final File keyFile
    final File certificateFile
    final String host
    final int httpPort
    final int httpsPort
    final String logoutPath
    final String authenticationUrl
    final String currentUserUrl
    final String refreshGoogleAccessTokenUrl
    final List<EndpointConfig> endpointConfigs

    static ProxyConfig create() {
        def c = new Config('api-gateway-server.properties')
        new ProxyConfig(
                keyFile: new File(FileSystem.configDir(), 'sepal-https.key'),
                certificateFile: new File(FileSystem.configDir(), 'sepal-https.crt'),
                host: c.host,
                httpPort: c.integer('httpPort'),
                httpsPort: c.integer('httpsPort'),
                logoutPath: c.logoutPath,
                authenticationUrl: c.authenticationUrl,
                currentUserUrl: c.currentUserUrl,
                refreshGoogleAccessTokenUrl: c.refreshGoogleAccessTokenUrl,
                endpointConfigs: new JsonSlurper(type: LAX).parse(new File(FileSystem.configDir(), 'endpoints.json'))
                        .collect {
                    new EndpointConfig(
                            prefix: parseBoolean(it.prefix),
                            path: it.path,
                            target: URI.create(it.target),
                            rewriteRedirects: parseBoolean(it.rewriteRedirects),
                            https: parseBoolean(it.https),
                            authenticate: parseBoolean(it.authenticate),
                            cached: parseBoolean(it.cached),
                            noCache: parseBoolean(it.'no-cache')
                    )
                }.asImmutable()
        )
    }
}
