package org.openforis.sepal.component.workerinstance.api

import groovy.transform.Immutable

@Immutable
class WorkerInstance {
    String id
    String type
    Reservation reservation

    WorkerInstance release() {
        new WorkerInstance(id: id, type: type, reservation: null)
    }

    WorkerInstance reserve(Reservation reservation) {
        new WorkerInstance(id: id, type: type, reservation: reservation)
    }
}
