package org.openforis.sepal.util

interface Clock {
    Date now();
}

class SystemClock implements Clock {
    Date now() {
        new Date()
    }
}