package org.openforis.sepal.component.sandboxmanager

import groovy.transform.ToString


@ToString
class InvalidSession extends RuntimeException {
    final String reason

    InvalidSession(String reason) {
        super(reason)
        this.reason = reason
    }

    InvalidSession(String reason, Throwable cause) {
        super(reason, cause)
        this.reason = reason
    }
}
