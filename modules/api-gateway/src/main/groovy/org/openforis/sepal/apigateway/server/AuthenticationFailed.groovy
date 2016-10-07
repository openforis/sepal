package org.openforis.sepal.apigateway.server

class AuthenticationFailed extends RuntimeException {
    AuthenticationFailed(int status, data) {
        super("Status code: $status, data: $data")
    }
}
