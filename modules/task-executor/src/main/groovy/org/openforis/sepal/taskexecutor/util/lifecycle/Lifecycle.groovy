package org.openforis.sepal.taskexecutor.util.lifecycle

interface Lifecycle extends Stoppable {
    void start()

    void stop()
}