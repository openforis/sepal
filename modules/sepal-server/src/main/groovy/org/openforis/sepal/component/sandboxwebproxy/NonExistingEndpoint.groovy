package org.openforis.sepal.component.sandboxwebproxy

class NonExistingEndpoint extends RuntimeException {
    NonExistingEndpoint(String message) {
        super(message)
    }
}
