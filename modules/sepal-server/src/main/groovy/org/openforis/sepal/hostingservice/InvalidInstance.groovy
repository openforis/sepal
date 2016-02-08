package org.openforis.sepal.hostingservice


class InvalidInstance extends RuntimeException {

    String reason

    InvalidInstance(String reason) {
        super(reason)
        this.reason = reason
    }
}
