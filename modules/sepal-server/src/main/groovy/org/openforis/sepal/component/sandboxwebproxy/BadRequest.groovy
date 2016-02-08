package org.openforis.sepal.component.sandboxwebproxy

class BadRequest extends RuntimeException {
    BadRequest(String message) {
        super(message)
    }
}
