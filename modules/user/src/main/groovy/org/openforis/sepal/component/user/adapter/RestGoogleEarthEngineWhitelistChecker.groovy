package org.openforis.sepal.component.user.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.user.api.GoogleEarthEngineWhitelistChecker
import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.user.User

class RestGoogleEarthEngineWhitelistChecker implements GoogleEarthEngineWhitelistChecker {
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
            return false
        }
    }

    private RESTClient getHttp() {
        new RESTClient(googleEarthEngineUri)
    }
}
