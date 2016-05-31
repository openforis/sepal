package org.openforis.sepal.component.workerinstance

import org.openforis.sepal.component.AbstractComponent
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.command.*
import org.openforis.sepal.component.workerinstance.event.InstancePendingProvisioning
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.util.Clock

import javax.sql.DataSource

class WorkerInstanceComponent extends AbstractComponent {
    WorkerInstanceComponent(
            DataSource dataSource,
            HandlerRegistryEventDispatcher eventDispatcher,
            InstanceProvider instanceProvider,
            InstanceProvisioner instanceProvisioner,
            Clock clock) {
        super(dataSource, eventDispatcher)

        command(RequestInstance, new RequestInstanceHandler(instanceProvider, eventDispatcher))
        command(ReleaseInstance, new ReleaseInstanceHandler(instanceProvider, instanceProvisioner, eventDispatcher))
        command(ProvisionInstance, new ProvisionInstanceHandler(instanceProvisioner, eventDispatcher))
        command(ReleaseUnusedInstances, new ReleaseUnusedInstancesHandler(instanceProvider, instanceProvisioner, eventDispatcher))

        on(InstancePendingProvisioning) {
            submit(new ProvisionInstance(
                    username: it.instance.reservation.username,
                    instance: it.instance))
        }
    }
}
