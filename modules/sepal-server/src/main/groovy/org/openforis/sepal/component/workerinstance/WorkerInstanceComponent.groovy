package org.openforis.sepal.component.workerinstance

import org.openforis.sepal.component.DataSourceBackedComponent
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workerinstance.adapter.JdbcInstanceRepository
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.command.*
import org.openforis.sepal.component.workerinstance.event.InstancePendingProvisioning
import org.openforis.sepal.component.workerinstance.query.FindMissingInstances
import org.openforis.sepal.component.workerinstance.query.FindMissingInstancesHandler
import org.openforis.sepal.event.AsynchronousEventDispatcher
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.sql.DatabaseConfig
import org.openforis.sepal.sql.SqlConnectionManager
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.SystemClock

import static java.util.concurrent.TimeUnit.MINUTES

class WorkerInstanceComponent extends DataSourceBackedComponent {
    static final String SCHEMA = 'worker_instance'

    private final InstanceProvider instanceProvider
    private final List<InstanceType> instanceTypes

    static WorkerInstanceComponent create(HostingServiceAdapter hostingServiceAdapter) {
        def connectionManager = SqlConnectionManager.create(DatabaseConfig.fromPropertiesFile(SCHEMA))
        return new WorkerInstanceComponent(
                connectionManager,
                new AsynchronousEventDispatcher(),
                hostingServiceAdapter.instanceProvider,
                hostingServiceAdapter.instanceTypes,
                hostingServiceAdapter.instanceProvisioner,
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
        def instanceRepository = new JdbcInstanceRepository(connectionManager)
        command(RequestInstance, new RequestInstanceHandler(instanceRepository, instanceProvider, eventDispatcher, clock))
        command(ReleaseInstance, new ReleaseInstanceHandler(instanceRepository, instanceProvider, instanceProvisioner, eventDispatcher))
        command(ProvisionInstance, new ProvisionInstanceHandler(instanceProvisioner, eventDispatcher))
        command(ReleaseUnusedInstances, new ReleaseUnusedInstancesHandler(instanceRepository, instanceProvider, instanceProvisioner, eventDispatcher, clock))
        command(SizeIdlePool, new SizeIdlePoolHandler(instanceRepository, instanceProvider, eventDispatcher, clock))

        query(FindMissingInstances, new FindMissingInstancesHandler(instanceProvisioner))

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
