package org.openforis.sepal.endpoint

class MalformedRequest extends RuntimeException {
    MalformedRequest(String message) {
        super(message)
    }

    MalformedRequest(String message, Throwable cause) {
        super(message, cause)
    }
}
