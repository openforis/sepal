package org.openforis.sepal.component.workerinstance.api

import groovy.transform.Immutable

@Immutable
class WorkerInstance {
    String id
    String type
    String host
    boolean running
    Date launchTime
    WorkerReservation reservation

    boolean isReserved() {
        reservation != null
    }

    WorkerInstance release() {
        assert reservation, "Instance is already idle"
        new WorkerInstance(id: id, type: type, host: host, running: running, launchTime: launchTime, reservation: null)
    }

    WorkerInstance reserve(WorkerReservation reservation) {
        assert !this.reservation, "Instance is already reserved: ${this.reservation}"
        new WorkerInstance(id: id, type: type, host: host, running: running, launchTime: launchTime, reservation: reservation)
    }

    WorkerInstance launched(String host, Date launchTime) {
        new WorkerInstance(id: id, type: type, host: host, running: running, launchTime: launchTime, reservation: reservation)
    }

    WorkerInstance running() {
        new WorkerInstance(id: id, type: type, host: host, running: true, launchTime: launchTime, reservation: reservation)
    }
}
