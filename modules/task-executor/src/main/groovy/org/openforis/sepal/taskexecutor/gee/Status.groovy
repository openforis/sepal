package org.openforis.sepal.taskexecutor.gee

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class Status {
    State state
    String message


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
