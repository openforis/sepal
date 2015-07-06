package org.openforis.sepal.util

class Is {
    static void notNull(o, String errorMessage = 'Cannot be null') {
        if (o == null)
            throw new IllegalArgumentException(errorMessage)
    }
}
