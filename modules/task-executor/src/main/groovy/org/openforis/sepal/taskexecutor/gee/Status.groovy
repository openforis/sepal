package org.openforis.sepal.taskexecutor.gee

import org.openforis.sepal.taskexecutor.util.annotation.ImmutableData

@ImmutableData
class Status {
    State state
    String message
    String filename


    boolean isActive() {
        state == State.ACTIVE
    }

    boolean hasCompleted() {
        state == State.COMPLETED
    }

    boolean hasFailed() {
        state == State.FAILED
    }

    enum State {
        ACTIVE, COMPLETED, FAILED
    }
}
