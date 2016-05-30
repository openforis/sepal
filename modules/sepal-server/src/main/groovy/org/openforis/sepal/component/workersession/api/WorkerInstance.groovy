package org.openforis.sepal.component.workersession.api

import groovy.transform.Immutable

@Immutable
class WorkerInstance {
    String id
    String host
    State state

    WorkerInstance activate() {
        new WorkerInstance(id: id, host: host, state: State.ACTIVE)
    }

    enum State {
        PENDING, ACTIVE
    }
}
