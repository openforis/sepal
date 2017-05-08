package org.openforis.sepal.user

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class GoogleTokens {
    static final int REFRESH_IF_EXPIRES_IN_MINUTES = 5

    String refreshToken
    String accessToken
    long accessTokenExpiryDate

    boolean shouldBeRefreshed(long nowMillis) {
        def expiresInMinutes = (accessTokenExpiryDate - nowMillis) / 60 / 1000 as int
        return expiresInMinutes <= REFRESH_IF_EXPIRES_IN_MINUTES
    }
}
