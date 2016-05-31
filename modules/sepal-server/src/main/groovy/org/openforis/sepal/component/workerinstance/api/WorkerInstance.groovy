package org.openforis.sepal.component.workerinstance.api

import groovy.transform.Immutable

@Immutable
class WorkerInstance {
    String id
    String type
    Reservation reservation

    WorkerInstance release() {
        assert reservation, "Instance is already idle"
        new WorkerInstance(id: id, type: type, reservation: null)
    }

    WorkerInstance reserve(Reservation reservation) {
        assert !this.reservation, "Instance is already reserved: ${this.reservation}"
        new WorkerInstance(id: id, type: type, reservation: reservation)
    }
}
