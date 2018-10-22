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

    boolean isIdle() {
        !isReserved()
    }

    WorkerInstance release() {
        new WorkerInstance(id: id, type: type, host: host, running: running, launchTime: launchTime, reservation: null)
    }

    WorkerInstance reserve(WorkerReservation reservation) {
        new WorkerInstance(id: id, type: type, host: host, running: running, launchTime: launchTime, reservation: reservation)
    }
}
