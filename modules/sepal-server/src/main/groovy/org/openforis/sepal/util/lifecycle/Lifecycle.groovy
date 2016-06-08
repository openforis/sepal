package org.openforis.sepal.util.lifecycle

interface Lifecycle extends Stoppable {
    void start()

    void stop()
}