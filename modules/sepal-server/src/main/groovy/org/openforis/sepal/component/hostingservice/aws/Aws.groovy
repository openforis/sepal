package org.openforis.sepal.component.hostingservice.aws

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

class Aws implements HostingServiceAdapter {
    private final config = new AwsConfig()
    private final double storageCostPerGbMonth = 0.33d + 2 * 0.023d // EFS + 2 * S3 backup (daily, weekly)
    final List<InstanceType> instanceTypes = [
            new InstanceType(id: 'T3aSmall', name: 't3a.small', hourlyCost: 0.0204, cpuCount: 1, ramGiB: 2, idleCount: 1),
            new InstanceType(id: 'T3aMedium', name: 't3a.medium', hourlyCost: 0.0408, cpuCount: 2, ramGiB: 4),
            new InstanceType(id: 'M5aLarge', name: 'm5a.large', hourlyCost: 0.096, cpuCount: 2, ramGiB: 8),
            new InstanceType(id: 'M5aXlarge', name: 'm5a.xlarge', hourlyCost: 0.192, cpuCount: 4, ramGiB: 16),
            new InstanceType(id: 'M5a2xlarge', name: 'm5a.2xlarge', hourlyCost: 0.384, cpuCount: 8, ramGiB: 32),
            new InstanceType(id: 'M5a4xlarge', name: 'm5a.4xlarge', hourlyCost: 0.768, cpuCount: 16, ramGiB: 64),
            new InstanceType(id: 'M5a12xlarge', name: 'm4.10xlarge', hourlyCost: 2.304, cpuCount: 48, ramGiB: 192),
            new InstanceType(id: 'M5a416xlarge', name: 'm5a.16xlarge', hourlyCost: 3.072, cpuCount: 64, ramGiB: 256),
            new InstanceType(id: 'C5Large', name: 'c5.large', hourlyCost: 0.096, cpuCount: 2, ramGiB: 4),
            new InstanceType(id: 'C5Xlarge', name: 'c5.xlarge', hourlyCost: 0.192, cpuCount: 4, ramGiB: 8),
            new InstanceType(id: 'C52xlarge', name: 'c5.2xlarge', hourlyCost: 0.384, cpuCount: 8, ramGiB: 16),
            new InstanceType(id: 'C54xlarge', name: 'c5.4xlarge', hourlyCost: 0.768, cpuCount: 16, ramGiB: 32),
            new InstanceType(id: 'C59xlarge', name: 'c5.9xlarge', hourlyCost: 1.728, cpuCount: 36, ramGiB: 72),
            new InstanceType(id: 'R5Large', name: 'r5.large', hourlyCost: 0.141, cpuCount: 2, ramGiB: 16),
            new InstanceType(id: 'R5Xlarge', name: 'r5.xlarge', hourlyCost: 0.282, cpuCount: 4, ramGiB: 32),
            new InstanceType(id: 'R52xlarge', name: 'r5.2xlarge', hourlyCost: 0.564, cpuCount: 8, ramGiB: 64),
            new InstanceType(id: 'R54xlarge', name: 'r5.4xlarge', hourlyCost: 1.128, cpuCount: 16, ramGiB: 128),
            new InstanceType(id: 'R58xlarge', name: 'r5.8xlarge', hourlyCost: 2.256, cpuCount: 32, ramGiB: 256),
            new InstanceType(id: 'R516xlarge', name: 'r5.16xlarge', hourlyCost: 4.512, cpuCount: 64, ramGiB: 512),
            new InstanceType(id: 'X116xlarge', name: 'x1.16xlarge', hourlyCost: 8.003, cpuCount: 64, ramGiB: 976),
            new InstanceType(id: 'X132xlarge', name: 'x1.32xlarge', hourlyCost: 16.006, cpuCount: 128, ramGiB: 1920)
    ].asImmutable()

    HostingService getHostingService() {
        return new AwsHostingService(instanceTypes, storageCostPerGbMonth)
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

    InstanceProvisioner getInstanceProvisioner() {
        new DockerInstanceProvisioner(new WorkerInstanceConfig(), instanceTypes, config.syslogHost)
    }
}
