package org.openforis.sepal.component.user.api

class UsingInvalidToken extends RuntimeException {
    private final String token
    private final TokenStatus tokenStatus

    UsingInvalidToken(String token, TokenStatus tokenStatus) {
        super("Trying to use an invalid token: $token. Status: $tokenStatus")
        this.token = token
        this.tokenStatus = tokenStatus
    }
}
