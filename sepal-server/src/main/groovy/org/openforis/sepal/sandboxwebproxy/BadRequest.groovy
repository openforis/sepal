package org.openforis.sepal.sandboxwebproxy

class BadRequest extends RuntimeException {
    BadRequest(String message) {
        super(message)
    }
}
