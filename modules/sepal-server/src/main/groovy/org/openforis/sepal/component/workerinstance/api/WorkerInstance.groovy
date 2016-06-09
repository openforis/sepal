package org.openforis.sepal.component.workerinstance.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
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
        new WorkerInstance(id: id, type: type, host: host, running: running, launchTime: launchTime, reservation: null)
    }

    WorkerInstance reserve(WorkerReservation reservation) {
        new WorkerInstance(id: id, type: type, host: host, running: running, launchTime: launchTime, reservation: reservation)
    }

    WorkerInstance launched(String host, Date launchTime) {
        new WorkerInstance(id: id, type: type, host: host, running: running, launchTime: launchTime, reservation: reservation)
    }

    WorkerInstance running() {
        new WorkerInstance(id: id, type: type, host: host, running: true, launchTime: launchTime, reservation: reservation)
    }
}
