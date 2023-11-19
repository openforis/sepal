package org.openforis.sepal.user

import groovy.transform.Immutable

@Immutable
class GoogleTokens {
    static final int REFRESH_IF_EXPIRES_IN_MINUTES = 10

    String refreshToken
    String accessToken
    long accessTokenExpiryDate
    String projectId
    boolean legacyProject

    boolean shouldBeRefreshed(long nowMillis) {
        def expiresInMinutes = (accessTokenExpiryDate - nowMillis) / 60 / 1000 as int
        return expiresInMinutes <= REFRESH_IF_EXPIRES_IN_MINUTES
    }
}
