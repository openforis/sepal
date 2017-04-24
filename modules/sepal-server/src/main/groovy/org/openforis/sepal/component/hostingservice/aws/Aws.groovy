package org.openforis.sepal.component.hostingservice.aws

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workersession.api.InstanceType
import org.openforis.sepal.util.ExecutorServiceBasedJobScheduler
import org.openforis.sepal.util.NamedThreadFactory

import java.util.concurrent.Executors

class Aws implements HostingServiceAdapter {
    private final config = new AwsConfig()
    private final double storageCostPerGbMonth = 0.33d + 2 * 0.023d // EFS + 2 * S3 backup (daily, weekly)
    final List<InstanceType> instanceTypes = [
            new InstanceType(id: 'T2Small', name: 't2.small', hourlyCost: 0.025, description: '1 CPU / 2 GiB', idleCount: 1),
            new InstanceType(id: 'T2Medium', name: 't2.medium', hourlyCost: 0.05, description: '2 CPU / 4 GiB'),
            new InstanceType(id: 'T2Large', name: 't2.large', hourlyCost: 0.101, description: '2 CPU / 8 GiB'),
            new InstanceType(id: 'M3Medium', name: 'm3.medium', hourlyCost: 0.073, description: '1 CPU / 3.75 GiB'),
            new InstanceType(id: 'M4Large', name: 'm4.large', hourlyCost: 0.119, description: '2 CPU / 8 GiB'),
            new InstanceType(id: 'M4Xlarge', name: 'm4.xlarge', hourlyCost: 0.238, description: '4 CPU / 16 GiB'),
            new InstanceType(id: 'M42xlarge', name: 'm4.2xlarge', hourlyCost: 0.475, description: '8 CPU / 32 GiB'),
            new InstanceType(id: 'M44xlarge', name: 'm4.4xlarge', hourlyCost: 0.95, description: '16 CPU / 64 GiB'),
            new InstanceType(id: 'M410xlarge', name: 'm4.10xlarge', hourlyCost: 2.377, description: '40 CPU / 160 GiB'),
            new InstanceType(id: 'M416xlarge', name: 'm4.16xlarge', hourlyCost: 3.803, description: '64 CPU / 256 GiB'),
            new InstanceType(id: 'C4Large', name: 'c4.large', hourlyCost: 0.113, description: '2 CPU / 3.75 GiB'),
            new InstanceType(id: 'C4Xlarge', name: 'c4.xlarge', hourlyCost: 0.226, description: '4 CPU / 7.5 GiB'),
            new InstanceType(id: 'C42xlarge', name: 'c4.2xlarge', hourlyCost: 0.453, description: '8 CPU / 15 GiB'),
            new InstanceType(id: 'C44xlarge', name: 'c4.4xlarge', hourlyCost: 0.905, description: '16 CPU / 30 GiB'),
            new InstanceType(id: 'C48xlarge', name: 'c4.8xlarge', hourlyCost: 1.811, description: '36 CPU / 60 GiB'),
            new InstanceType(id: 'R4Large', name: 'r4.large', hourlyCost: 0.148, description: '2 CPU / 15.25 GiB'),
            new InstanceType(id: 'R4Xlarge', name: 'r4.xlarge', hourlyCost: 0.296, description: '4 CPU / 30.5 GiB'),
            new InstanceType(id: 'R42xlarge', name: 'r4.2xlarge', hourlyCost: 0.593, description: '8 CPU / 61 GiB'),
            new InstanceType(id: 'R44xlarge', name: 'r4.4xlarge', hourlyCost: 1.186, description: '16 CPU / 122 GiB'),
            new InstanceType(id: 'R48xlarge', name: 'r4.8xlarge', hourlyCost: 2.371, description: '32 CPU / 244 GiB'),
            new InstanceType(id: 'R416xlarge', name: 'r4.16xlarge', hourlyCost: 4.742, description: '64 CPU / 488 GiB'),
            new InstanceType(id: 'X116xlarge', name: 'x1.16xlarge', hourlyCost: 8.003, description: '64 CPU / 976 GiB'),
            new InstanceType(id: 'X132xlarge', name: 'x1.32xlarge', hourlyCost: 16.006, description: '128 CPU / 1920 GiB')
    ].asImmutable()

    HostingService getHostingService() {
        return new AwsHostingService(instanceTypes, storageCostPerGbMonth, config.userHomeDirTemplate)
    }

    InstanceProvider getInstanceProvider() {
        return new AwsInstanceProvider(
                new ExecutorServiceBasedJobScheduler(
                        Executors.newSingleThreadScheduledExecutor(
                                NamedThreadFactory.singleThreadFactory('aws.instanceLaunchMonitor')
                        )
                ),
                config
        )
    }
}
