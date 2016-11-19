package org.openforis.sepal.component.sandboxwebproxy

class BadRequest extends RuntimeException {
    final int status

    BadRequest(String message, int status) {
        super(message)
        this.status = status
    }
}
