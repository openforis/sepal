package org.openforis.sepal.user

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class GoogleTokens {
    String refreshToken
    String accessToken
    long accessTokenExpiryDate
}
