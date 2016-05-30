package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.Reservation
import org.openforis.sepal.component.workerinstance.api.WorkerInstance

class RequestInstance extends AbstractCommand<WorkerInstance> {
    String workerType
    String instanceType
}

class RequestInstanceHandler implements CommandHandler<WorkerInstance, RequestInstance> {
    private final InstanceProvider instanceProvider

    RequestInstanceHandler(InstanceProvider instanceProvider) {
        this.instanceProvider = instanceProvider
    }

    WorkerInstance execute(RequestInstance command) {
        def reservation = new Reservation(username: command.username, workerType: command.workerType)
        def idleInstance = idleInstance(command.instanceType)
        if (idleInstance)
            return reserveIdle(idleInstance, reservation)
        return launchInstance(reservation, command)
    }

    private WorkerInstance reserveIdle(WorkerInstance idleInstance, Reservation reservation) {
        def instance = idleInstance.reserve(reservation)
        instanceProvider.reserve(instance)
        return instance
    }

    private WorkerInstance launchInstance(Reservation reservation, RequestInstance command) {
        def instance = new WorkerInstance(
                id: UUID.randomUUID().toString(),
                reservation: reservation,
                type: command.instanceType
        )
        instanceProvider.launchReserved(instance)
        return instance
    }

    private WorkerInstance idleInstance(String instanceType) {
        def idleInstances = instanceProvider.idleInstances(instanceType)
        idleInstances ? idleInstances.first() : null
    }
}
