package org.openforis.sepal.component.workersession.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.workersession.api.GoogleOAuthGateway
import org.openforis.sepal.security.Roles
import org.openforis.sepal.user.User

import static groovyx.net.http.ContentType.JSON

class RestGoogleOAuthGateway implements GoogleOAuthGateway {
    private final String endpointUri

    RestGoogleOAuthGateway(String endpointUri) {
        this.endpointUri = endpointUri
    }

    void refreshTokens(String username) {
        // We don't have a user with access token
        http.post(path: 'refresh-access-token',
                requestContentType: JSON,
                headers: ['sepal-user': new User(username: username, roles: [Roles.ADMIN]).jsonString()]
        )
    }

    private RESTClient getHttp() {
        new RESTClient(endpointUri)
    }
}
