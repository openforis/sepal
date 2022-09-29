package org.openforis.sepal.component.hostingservice.gcp

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workerinstance.WorkerInstanceConfig
import org.openforis.sepal.component.workerinstance.adapter.DockerInstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.util.ExecutorServiceBasedJobScheduler
import org.openforis.sepal.util.NamedThreadFactory

import java.util.concurrent.Executors

class Gcp implements HostingServiceAdapter {
    private final config = new GcpConfig()
    private final double storageCostPerGbMonth = 0.33d + 2 * 0.023d // EFS + 2 * S3 backup (daily, weekly)
    final List<InstanceType> instanceTypes = [
            new InstanceType(id: 'T3aSmall', name: 't3a.small', tag: 't1', hourlyCost: 0.0204, cpuCount: 1, ramGiB: 2, idleCount: 0),
    ].asImmutable()


    HostingService getHostingService() {
        return new GcpHostingService(instanceTypes, storageCostPerGbMonth)
    }

    InstanceProvider getInstanceProvider() {
        return new GcpInstanceProvider(
                new ExecutorServiceBasedJobScheduler(
                        Executors.newSingleThreadScheduledExecutor(
                                NamedThreadFactory.singleThreadFactory('gcp.instanceLaunchMonitor')
                        )
                ),
                config
        )
    }

    InstanceProvisioner getInstanceProvisioner() {
        new DockerInstanceProvisioner(new WorkerInstanceConfig(), instanceTypes, config.syslogAddress)
    }
}
