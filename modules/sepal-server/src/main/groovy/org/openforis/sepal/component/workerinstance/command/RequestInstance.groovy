package org.openforis.sepal.component.workerinstance.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceRepository
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.api.WorkerReservation
import org.openforis.sepal.component.workerinstance.event.FailedToRequestInstance
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
    private final InstanceRepository instanceRepository
    private final InstanceProvider instanceProvider
    private final EventDispatcher eventDispatcher
    private final Clock clock

    RequestInstanceHandler(InstanceRepository instanceRepository, InstanceProvider instanceProvider, EventDispatcher eventDispatcher, Clock clock) {
        this.instanceRepository = instanceRepository
        this.instanceProvider = instanceProvider
        this.eventDispatcher = eventDispatcher
        this.clock = clock
    }

    WorkerInstance execute(RequestInstance command) {
        try {
            def reservation = new WorkerReservation(username: command.username, workerType: command.workerType)
            def idleInstance = idleInstance(command.instanceType)
            if (idleInstance)
                return reserveIdle(idleInstance, reservation, command)
            return launchInstance(reservation, command)
        } catch (Exception e) {
            eventDispatcher.publish(new FailedToRequestInstance(command.workerType, command.instanceType, e))
            throw e
        }
    }

    private WorkerInstance reserveIdle(WorkerInstance idleInstance, WorkerReservation reservation, command) {
        def instance = idleInstance.reserve(reservation)
        def raceCondition = !instanceRepository.reserved(idleInstance.id, reservation.workerType)
        if (raceCondition) {
            LOG.info("Encountered race-condition when reserving idle instance. Launching new instead. instance: $idleInstance, reservation: $reservation")
            return launchInstance(reservation, command)
        }
        instanceProvider.reserve(instance)
        LOG.debug("Reserved idle instance. instance: $idleInstance, reservation: $reservation")
        eventDispatcher.publish(new InstancePendingProvisioning(instance))
        return instance
    }

    private WorkerInstance launchInstance(WorkerReservation reservation, RequestInstance command) {
        def launchedInstance = instanceProvider.launchReserved(command.instanceType, reservation)
        instanceRepository.launched([launchedInstance])
        LOG.debug("Launched new instance. instance: $launchedInstance, reservation: $reservation")
        eventDispatcher.publish(new InstanceLaunched(launchedInstance))
        return launchedInstance
    }

    private WorkerInstance idleInstance(String instanceType) {
        def idleIds = instanceRepository.idleInstances(instanceType)
        def idleInstances = instanceProvider.idleInstances(instanceType)
                .findAll { it.id in idleIds }
        idleInstances ? idleInstances.first() : null
    }
}
