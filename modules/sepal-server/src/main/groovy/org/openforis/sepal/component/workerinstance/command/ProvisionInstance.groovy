package org.openforis.sepal.component.workerinstance.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import groovyx.net.http.HttpResponseException
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.component.workerinstance.event.FailedToProvisionInstance
import org.openforis.sepal.component.workerinstance.event.InstanceProvisioned
import org.openforis.sepal.event.EventDispatcher

@EqualsAndHashCode(callSuper = true)
@Canonical
class ProvisionInstance extends AbstractCommand<Void> {
    WorkerInstance instance
}

class ProvisionInstanceHandler implements CommandHandler<Void, ProvisionInstance> {
    private final InstanceProvisioner instanceProvisioner
    private final EventDispatcher eventDispatcher

    ProvisionInstanceHandler(InstanceProvisioner instanceProvisioner, EventDispatcher eventDispatcher) {
        this.instanceProvisioner = instanceProvisioner
        this.eventDispatcher = eventDispatcher
    }

    Void execute(ProvisionInstance command) {
        try {
            instanceProvisioner.provisionInstance(command.instance)
            eventDispatcher.publish(new InstanceProvisioned(command.instance))
        } catch (HttpResponseException e) {
            def message = (e?.response?.data ?: e.toString()) as String
            eventDispatcher.publish(new FailedToProvisionInstance(command.instance, message as String))
            throw new RuntimeException(message, e)
        } catch (Exception e) {
            eventDispatcher.publish(new FailedToProvisionInstance(command.instance, e.toString()))
            throw e
        }
        return null
    }
}
