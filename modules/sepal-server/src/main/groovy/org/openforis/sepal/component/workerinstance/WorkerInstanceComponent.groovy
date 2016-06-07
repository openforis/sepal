package org.openforis.sepal.component.workerinstance

import org.openforis.sepal.component.AbstractComponent
import org.openforis.sepal.component.workerinstance.adapter.DockerInstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.command.*
import org.openforis.sepal.component.workerinstance.event.InstancePendingProvisioning
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock
import org.openforis.sepal.workertype.WorkerTypes

import javax.sql.DataSource

class WorkerInstanceComponent extends AbstractComponent {
    private final InstanceProvider instanceProvider

    WorkerInstanceComponent(InstanceProvider instanceProvider, DataSource dataSource) {
        this(
                dataSource,
                new HandlerRegistryEventDispatcher(),
                instanceProvider,
                new DockerInstanceProvisioner(
                        new WorkerInstanceConfig(
                                '/data/sepal/workerInstance.properties',
                                new WorkerTypes().workerTypeByName()
                        )
                ),
                new SystemClock()
        )
    }

    WorkerInstanceComponent(
            DataSource dataSource,
            HandlerRegistryEventDispatcher eventDispatcher,
            InstanceProvider instanceProvider,
            InstanceProvisioner instanceProvisioner,
            Clock clock) {
        super(dataSource, eventDispatcher)

        this.instanceProvider = instanceProvider
        command(RequestInstance, new RequestInstanceHandler(instanceProvider, eventDispatcher, clock))
        command(ReleaseInstance, new ReleaseInstanceHandler(instanceProvider, instanceProvisioner, eventDispatcher))
        command(ProvisionInstance, new ProvisionInstanceHandler(instanceProvisioner, eventDispatcher))
        command(ReleaseUnusedInstances, new ReleaseUnusedInstancesHandler(instanceProvider, instanceProvisioner, eventDispatcher, clock))
        command(SizeIdlePool, new SizeIdlePoolHandler(instanceProvider, eventDispatcher, clock))

        instanceProvider.onInstanceLaunched() {
            if (it.reserved)
                eventDispatcher.publish(new InstancePendingProvisioning(instance: it))
        }

        on(InstancePendingProvisioning) {
            submit(new ProvisionInstance(
                    username: it.instance.reservation.username,
                    instance: it.instance))
        }
    }

    void onStart() {
        instanceProvider.start()
    }

    void onStop() {
        instanceProvider.stop()
    }
}
