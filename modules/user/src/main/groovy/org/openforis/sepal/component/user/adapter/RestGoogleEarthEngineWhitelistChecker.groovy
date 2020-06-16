package org.openforis.sepal.component.user.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.user.api.GoogleEarthEngineWhitelistChecker
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.user.User
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class RestGoogleEarthEngineWhitelistChecker implements GoogleEarthEngineWhitelistChecker {
    private static final Logger LOG = LoggerFactory.getLogger(RestGoogleEarthEngineWhitelistChecker)
    private final String googleEarthEngineUri

    RestGoogleEarthEngineWhitelistChecker(String googleEarthEngineUri) {
        this.googleEarthEngineUri = googleEarthEngineUri
    }

    boolean isWhitelisted(String username, GoogleTokens tokens) {
        try {
            http.get(
                    path: 'healthcheck',
                    headers: ['sepal-user': new User(username: username, googleTokens: tokens).jsonString()]
            )
            return true
        } catch (Exception e) {
            LOG.debug("Not whitelisted. username: $username, googleEarthEngineUri: $googleEarthEngineUri", e)
            return false
        }
    }

    private RESTClient getHttp() {
        new RESTClient(googleEarthEngineUri)
    }
}
