package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.Reservation
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.event.InstanceLaunched
import org.openforis.sepal.component.workerinstance.event.InstancePendingProvisioning
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.Clock

class RequestInstance extends AbstractCommand<WorkerInstance> {
    String workerType
    String instanceType
}

class RequestInstanceHandler implements CommandHandler<WorkerInstance, RequestInstance> {
    private final InstanceProvider instanceProvider
    private final EventDispatcher eventDispatcher
    private final Clock clock

    RequestInstanceHandler(InstanceProvider instanceProvider, EventDispatcher eventDispatcher, Clock clock) {
        this.instanceProvider = instanceProvider
        this.eventDispatcher = eventDispatcher
        this.clock = clock
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
        eventDispatcher.publish(new InstancePendingProvisioning(instance))
        return instance
    }

    private WorkerInstance launchInstance(Reservation reservation, RequestInstance command) {
        def instance = new WorkerInstance(
                id: UUID.randomUUID().toString(),
                reservation: reservation,
                launchTime: clock.now(),
                type: command.instanceType
        )
        instanceProvider.launchReserved(instance)
        eventDispatcher.publish(new InstanceLaunched(instance))
        return instance
    }

    private WorkerInstance idleInstance(String instanceType) {
        def idleInstances = instanceProvider.idleInstances(instanceType)
        idleInstances ? idleInstances.first() : null
    }
}
