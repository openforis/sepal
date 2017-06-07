package org.openforis.sepal.component.hostingservice.aws

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.util.ExecutorServiceBasedJobScheduler
import org.openforis.sepal.util.NamedThreadFactory

import java.util.concurrent.Executors

class Aws implements HostingServiceAdapter {
    private final config = new AwsConfig()
    private final double storageCostPerGbMonth = 0.33d + 2 * 0.023d // EFS + 2 * S3 backup (daily, weekly)
    final List<InstanceType> instanceTypes = [
            new InstanceType(id: 'T2Small', name: 't2.small', hourlyCost: 0.025, cpuCount: 1, ramGiB: 2, idleCount: 1),
            new InstanceType(id: 'T2Medium', name: 't2.medium', hourlyCost: 0.05, cpuCount: 2, ramGiB: 4),
            new InstanceType(id: 'T2Large', name: 't2.large', hourlyCost: 0.101, cpuCount: 3, ramGiB: 8),
            new InstanceType(id: 'M3Medium', name: 'm3.medium', hourlyCost: 0.073, cpuCount: 1, ramGiB: 3.75),
            new InstanceType(id: 'M4Large', name: 'm4.large', hourlyCost: 0.119, cpuCount: 2, ram: 8),
            new InstanceType(id: 'M4Xlarge', name: 'm4.xlarge', hourlyCost: 0.238, cpuCount: 4, ramGiB: 16),
            new InstanceType(id: 'M42xlarge', name: 'm4.2xlarge', hourlyCost: 0.475, cpuCount: 8, ramGiB: 32),
            new InstanceType(id: 'M44xlarge', name: 'm4.4xlarge', hourlyCost: 0.95, cpuCount: 16, ramGiB: 64),
            new InstanceType(id: 'M410xlarge', name: 'm4.10xlarge', hourlyCost: 2.377, cpuCount: 40, ramGiB: 160),
            new InstanceType(id: 'M416xlarge', name: 'm4.16xlarge', hourlyCost: 3.803, cpuCount: 64, ramGiB: 256),
            new InstanceType(id: 'C4Large', name: 'c4.large', hourlyCost: 0.113, cpuCount: 2, ramGiB: 3.75),
            new InstanceType(id: 'C4Xlarge', name: 'c4.xlarge', hourlyCost: 0.226, cpuCount: 4, ramGiB: 7.5),
            new InstanceType(id: 'C42xlarge', name: 'c4.2xlarge', hourlyCost: 0.453, cpuCount: 8, ramGiB: 15),
            new InstanceType(id: 'C44xlarge', name: 'c4.4xlarge', hourlyCost: 0.905, cpuCount: 16, ramGiB: 30),
            new InstanceType(id: 'C48xlarge', name: 'c4.8xlarge', hourlyCost: 1.811, cpuCount: 36, ramGiB: 60),
            new InstanceType(id: 'R4Large', name: 'r4.large', hourlyCost: 0.148, cpuCount: 2, ramGiB: 15.25),
            new InstanceType(id: 'R4Xlarge', name: 'r4.xlarge', hourlyCost: 0.296, cpuCount: 4, ramGiB: 30.5),
            new InstanceType(id: 'R42xlarge', name: 'r4.2xlarge', hourlyCost: 0.593, cpuCount: 8, ramGiB: 61),
            new InstanceType(id: 'R44xlarge', name: 'r4.4xlarge', hourlyCost: 1.186, cpuCount: 16, ramGiB: 122),
            new InstanceType(id: 'R48xlarge', name: 'r4.8xlarge', hourlyCost: 2.371, cpuCount: 32, ramGiB: 244),
            new InstanceType(id: 'R416xlarge', name: 'r4.16xlarge', hourlyCost: 4.742, cpuCount: 64, ramGiB: 488),
            new InstanceType(id: 'X116xlarge', name: 'x1.16xlarge', hourlyCost: 8.003, cpuCount: 64, ramGiB: 976),
            new InstanceType(id: 'X132xlarge', name: 'x1.32xlarge', hourlyCost: 16.006, cpuCount: 128, ramGiB: 1920)
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
