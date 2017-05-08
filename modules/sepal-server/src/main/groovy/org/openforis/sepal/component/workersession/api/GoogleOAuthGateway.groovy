package org.openforis.sepal.component.workersession.api

interface GoogleOAuthGateway {
    void refreshTokens(String username)
}