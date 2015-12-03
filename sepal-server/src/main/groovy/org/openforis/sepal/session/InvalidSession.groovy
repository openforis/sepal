package org.openforis.sepal.session


class InvalidSession extends RuntimeException{

    String reason

    InvalidSession(String reason){
        super(reason)
        this.reason = reason
    }

    InvalidSession(String reason, Throwable cause){
        super(reason,cause)
        this.reason = reason
    }
}
