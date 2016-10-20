package org.openforis.sepal.component.workerinstance

import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.workerinstance.adapter.DockerInstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.command.*
import org.openforis.sepal.component.workerinstance.event.InstancePendingProvisioning
import org.openforis.sepal.component.workersession.api.InstanceType
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.transaction.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import javax.sql.DataSource

import static java.util.concurrent.TimeUnit.MINUTES

class WorkerInstanceComponent extends DataSourceBackedComponent {
    private final InstanceProvider instanceProvider
    private final List<InstanceType> instanceTypes

    WorkerInstanceComponent(HostingServiceAdapter hostingServiceAdapter, DataSource dataSource) {
        this(
                new SqlConnectionManager(dataSource),
                new AsynchronousEventDispatcher(),
                hostingServiceAdapter.instanceProvider,
                hostingServiceAdapter.instanceTypes,
                new DockerInstanceProvisioner(new WorkerInstanceConfig()),
                new SystemClock()
        )
    }

    WorkerInstanceComponent(
            SqlConnectionManager connectionManager,
            HandlerRegistryEventDispatcher eventDispatcher,
            InstanceProvider instanceProvider,
            List<InstanceType> instanceTypes,
            InstanceProvisioner instanceProvisioner,
            Clock clock) {
        super(connectionManager, eventDispatcher)
        this.instanceProvider = instanceProvider
        this.instanceTypes = instanceTypes
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
        def targetIdleCountByInstanceType = instanceTypes.collectEntries {
            [(it.id): it.idleCount]
        }.findAll { it.value > 0 }
        schedule(1, MINUTES,
                new SizeIdlePool(
                        targetIdleCountByInstanceType: targetIdleCountByInstanceType,
                        timeBeforeChargeToTerminate: 5,
                        timeUnit: MINUTES))
        instanceProvider.start()
    }

    void onStop() {
        instanceProvider.stop()
        connectionManager.stop()
    }
}
