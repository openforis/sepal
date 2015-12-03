package org.openforis.sepal.session


class InvalidInstance extends RuntimeException{

    String reason

    InvalidInstance(String reason){
        super(reason)
        this.reason = reason
    }

    InvalidInstance(String reason, Throwable cause){
        super(reason,cause)
        this.reason = reason
    }
}
