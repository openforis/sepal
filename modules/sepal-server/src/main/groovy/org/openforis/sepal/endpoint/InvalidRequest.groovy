package org.openforis.sepal.endpoint

import groovymvc.bind.Errors
import groovymvc.bind.PropertyError

class InvalidRequest extends RuntimeException {
    final Map<String, String> errors

    InvalidRequest(Errors<PropertyError> errors) {
        this.errors = errors.collectEntries { String property, propertyErrors ->
            [property, propertyErrors.collect { error ->
                [
                        value  : error.invalidValue,
                        message: error.message
                ]
            }]
        } as Map<String, String>
    }

    InvalidRequest(Map errors) {
        this.errors = errors
    }
}
