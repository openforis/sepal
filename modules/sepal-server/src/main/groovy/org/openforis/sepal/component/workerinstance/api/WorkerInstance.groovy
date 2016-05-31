package org.openforis.sepal.component.workerinstance.api

import groovy.transform.Immutable

@Immutable
class WorkerInstance {
    String id
    String type
    String host
    Date launchTime
    Reservation reservation

    WorkerInstance release() {
        assert reservation, "Instance is already idle"
        new WorkerInstance(id: id, type: type, host: host, launchTime: launchTime, reservation: null)
    }

    WorkerInstance reserve(Reservation reservation) {
        assert !this.reservation, "Instance is already reserved: ${this.reservation}"
        new WorkerInstance(id: id, type: type, host: host, launchTime: launchTime, reservation: reservation)
    }

    WorkerInstance withHost(String host) {
        new WorkerInstance(id: id, type: type, host: host, launchTime: launchTime, reservation: reservation)
    }
}
