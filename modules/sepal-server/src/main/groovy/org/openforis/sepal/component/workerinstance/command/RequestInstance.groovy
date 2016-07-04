package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.api.WorkerReservation
import org.openforis.sepal.component.workerinstance.event.InstanceLaunched
import org.openforis.sepal.component.workerinstance.event.InstancePendingProvisioning
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.annotation.Data
import org.slf4j.Logger
import org.slf4j.LoggerFactory

@Data(callSuper = true)
class RequestInstance extends AbstractCommand<WorkerInstance> {
    String workerType
    String instanceType
}

class RequestInstanceHandler implements CommandHandler<WorkerInstance, RequestInstance> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final InstanceProvider instanceProvider
    private final EventDispatcher eventDispatcher
    private final Clock clock

    RequestInstanceHandler(InstanceProvider instanceProvider, EventDispatcher eventDispatcher, Clock clock) {
        this.instanceProvider = instanceProvider
        this.eventDispatcher = eventDispatcher
        this.clock = clock
    }

    WorkerInstance execute(RequestInstance command) {
        def reservation = new WorkerReservation(username: command.username, workerType: command.workerType)
        def idleInstance = idleInstance(command.instanceType)
        if (idleInstance)
            return reserveIdle(idleInstance, reservation)
        return launchInstance(reservation, command)
    }

    private WorkerInstance reserveIdle(WorkerInstance idleInstance, WorkerReservation reservation) {
        def instance = idleInstance.reserve(reservation)
        instanceProvider.reserve(instance)
        LOG.debug("Reserved idle instance. instance: $idleInstance, reservation: $reservation")
        eventDispatcher.publish(new InstancePendingProvisioning(instance))
        return instance
    }

    private WorkerInstance launchInstance(WorkerReservation reservation, RequestInstance command) {
        def launchedInstance = instanceProvider.launchReserved(command.instanceType, reservation)
        LOG.debug("Launched new instance. instance: $launchedInstance, reservation: $reservation")
        eventDispatcher.publish(new InstanceLaunched(launchedInstance))
        return launchedInstance
    }

    private WorkerInstance idleInstance(String instanceType) {
        def idleInstances = instanceProvider.idleInstances(instanceType)
        idleInstances ? idleInstances.first() : null
    }
}
