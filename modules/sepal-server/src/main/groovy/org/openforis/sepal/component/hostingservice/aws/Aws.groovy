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
    private final double storageCostPerGbMonth = 0.33d // EFS pricing
    // https://docs.aws.amazon.com/AWSJavaSDK/latest/javadoc/com/amazonaws/services/ec2/model/InstanceType.html
    //https://aws.amazon.com/es/ec2/pricing/on-demand/
    
    final List<InstanceType> instanceTypes = [
            new InstanceType(id: 'T3aSmall', name: 't3a.small', tag: 't1', hourlyCost: 0.0204, cpuCount: 1, ramGiB: 2, idleCount: 1),
            new InstanceType(id: 'T3aMedium', name: 't3a.medium', tag: 't2', hourlyCost: 0.0408, cpuCount: 2, ramGiB: 4),
            new InstanceType(id: 'M6aLarge', name: 'm6a.large', tag: 'm2', hourlyCost: 0.0963, cpuCount: 2, ramGiB: 8),
            new InstanceType(id: 'M6aXlarge', name: 'm6a.xlarge', tag: 'm4', hourlyCost: 0.1926, cpuCount: 4, ramGiB: 16),
            new InstanceType(id: 'M6a2xlarge', name: 'm6a.2xlarge', tag: 'm8', hourlyCost: 0.3852, cpuCount: 8, ramGiB: 32),
            new InstanceType(id: 'M6a4xlarge', name: 'm6a.4xlarge', tag: 'm16', hourlyCost: 0.7704, cpuCount: 16, ramGiB: 64),
            new InstanceType(id: 'M6a12xlarge', name: 'm6a.12xlarge', tag: 'm48', hourlyCost: 2.3112, cpuCount: 48, ramGiB: 192),
            new InstanceType(id: 'M6a16xlarge', name: 'm6a.16xlarge', tag: 'm64', hourlyCost: 3.0816, cpuCount: 64, ramGiB: 256),
            new InstanceType(id: 'C7aLarge', name: 'c7a.large', tag: 'c2', hourlyCost: 0.11012, cpuCount: 2, ramGiB: 4),
            new InstanceType(id: 'C7aXlarge', name: 'c7a.xlarge', tag: 'c4', hourlyCost: 0.22024, cpuCount: 4, ramGiB: 8),
            new InstanceType(id: 'C7a2xlarge', name: 'c7a.2xlarge', tag: 'c8', hourlyCost: 0.44048, cpuCount: 8, ramGiB: 16),
            new InstanceType(id: 'C7a4xlarge', name: 'c7a.4xlarge', tag: 'c16', hourlyCost: 0.88096, cpuCount: 16, ramGiB: 32),
            new InstanceType(id: 'C7a8xlarge', name: 'c7a.8xlarge', tag: 'c32', hourlyCost: 1.76192, cpuCount: 32, ramGiB: 64),
            new InstanceType(id: 'C7a12xlarge', name: 'c7a.16xlarge', tag: 'c64', hourlyCost: 3.52384, cpuCount: 64, ramGiB: 128),
            new InstanceType(id: 'R6aLarge', name: 'r6a.large', tag: 'r2', hourlyCost: 0.1269, cpuCount: 2, ramGiB: 16),
            new InstanceType(id: 'R6aXlarge', name: 'r6a.xlarge', tag: 'r4', hourlyCost: 0.2538, cpuCount: 4, ramGiB: 32),
            new InstanceType(id: 'R6a2xlarge', name: 'r6a.2xlarge', tag: 'r8', hourlyCost: 0.5076, cpuCount: 8, ramGiB: 64),
            new InstanceType(id: 'R6a4xlarge', name: 'r6a.4xlarge', tag: 'r16', hourlyCost: 1.0152, cpuCount: 16, ramGiB: 128),
            new InstanceType(id: 'R6a8xlarge', name: 'r6a.8xlarge', tag: 'r32', hourlyCost: 2.0304, cpuCount: 32, ramGiB: 256),
            new InstanceType(id: 'R6a16xlarge', name: 'r6a.16xlarge', tag: 'r64', hourlyCost: 4.0608, cpuCount: 64, ramGiB: 512),
            new InstanceType(id: 'X116xlarge', name: 'x1.16xlarge', tag: 'x64', hourlyCost: 8.003, cpuCount: 64, ramGiB: 976),
            new InstanceType(id: 'X132xlarge', name: 'x1.32xlarge', tag: 'x128', hourlyCost: 16.006, cpuCount: 128, ramGiB: 1920),
            new InstanceType(id: 'T2Small', name: 't2.small', hourlyCost: 0.025, cpuCount: 1, ramGiB: 2),
            new InstanceType(id: 'M3Medium', name: 'm3.medium', hourlyCost: 0.073, cpuCount: 1, ramGiB: 3.75),
            new InstanceType(id: 'M4Large', name: 'm4.large', hourlyCost: 0.119, cpuCount: 2, ramGiB: 8),
            new InstanceType(id: 'M4Xlarge', name: 'm4.xlarge', hourlyCost: 0.238, cpuCount: 4, ramGiB: 16),
            new InstanceType(id: 'M42xlarge', name: 'm4.2xlarge', hourlyCost: 0.475, cpuCount: 8, ramGiB: 32),
            new InstanceType(id: 'M44xlarge', name: 'm4.4xlarge', hourlyCost: 0.95, cpuCount: 16, ramGiB: 64),
            new InstanceType(id: 'M410xlarge', name: 'm4.10xlarge', hourlyCost: 2.377, cpuCount: 40, ramGiB: 160),
            new InstanceType(id: 'M416xlarge', name: 'm4.16xlarge', hourlyCost: 3.803, cpuCount: 64, ramGiB: 256),
            new InstanceType(id: 'M5aLarge', name: 'm5a.large', hourlyCost: 0.096, cpuCount: 2, ramGiB: 8),
            new InstanceType(id: 'M5aXlarge', name: 'm5a.xlarge', hourlyCost: 0.192, cpuCount: 4, ramGiB: 16),
            new InstanceType(id: 'M5a2xlarge', name: 'm5a.2xlarge', hourlyCost: 0.384, cpuCount: 8, ramGiB: 32),
            new InstanceType(id: 'M5a4xlarge', name: 'm5a.4xlarge', hourlyCost: 0.768, cpuCount: 16, ramGiB: 64),
            new InstanceType(id: 'M5a12xlarge', name: 'm4.10xlarge', hourlyCost: 2.304, cpuCount: 48, ramGiB: 192),
            new InstanceType(id: 'M5a16xlarge', name: 'm5a.16xlarge', hourlyCost: 3.072, cpuCount: 64, ramGiB: 256),
            new InstanceType(id: 'C4Large', name: 'c4.large', hourlyCost: 0.113, cpuCount: 2, ramGiB: 3.75),
            new InstanceType(id: 'C4Xlarge', name: 'c4.xlarge', hourlyCost: 0.226, cpuCount: 4, ramGiB: 7.5),
            new InstanceType(id: 'C42xlarge', name: 'c4.2xlarge', hourlyCost: 0.453, cpuCount: 8, ramGiB: 15),
            new InstanceType(id: 'C44xlarge', name: 'c4.4xlarge', hourlyCost: 0.905, cpuCount: 16, ramGiB: 30),
            new InstanceType(id: 'C48xlarge', name: 'c4.8xlarge', hourlyCost: 1.811, cpuCount: 36, ramGiB: 60),
            new InstanceType(id: 'C5Large', name: 'c5.large', hourlyCost: 0.096, cpuCount: 2, ramGiB: 4),
            new InstanceType(id: 'C5Xlarge', name: 'c5.xlarge', hourlyCost: 0.192, cpuCount: 4, ramGiB: 8),
            new InstanceType(id: 'C52xlarge', name: 'c5.2xlarge', hourlyCost: 0.384, cpuCount: 8, ramGiB: 16),
            new InstanceType(id: 'C54xlarge', name: 'c5.4xlarge', hourlyCost: 0.768, cpuCount: 16, ramGiB: 32),
            new InstanceType(id: 'C59xlarge', name: 'c5.9xlarge', hourlyCost: 1.728, cpuCount: 36, ramGiB: 72),
            new InstanceType(id: 'R4Large', name: 'r4.large', hourlyCost: 0.148, cpuCount: 2, ramGiB: 15.25),
            new InstanceType(id: 'R4Xlarge', name: 'r4.xlarge', hourlyCost: 0.296, cpuCount: 4, ramGiB: 30.5),
            new InstanceType(id: 'R42xlarge', name: 'r4.2xlarge', hourlyCost: 0.593, cpuCount: 8, ramGiB: 61),
            new InstanceType(id: 'R44xlarge', name: 'r4.4xlarge', hourlyCost: 1.186, cpuCount: 16, ramGiB: 122),
            new InstanceType(id: 'R48xlarge', name: 'r4.8xlarge', hourlyCost: 2.371, cpuCount: 32, ramGiB: 244),
            new InstanceType(id: 'R416xlarge', name: 'r4.16xlarge', hourlyCost: 4.742, cpuCount: 64, ramGiB: 488),
            new InstanceType(id: 'R5Large', name: 'r5.large', hourlyCost: 0.141, cpuCount: 2, ramGiB: 16),
            new InstanceType(id: 'R5Xlarge', name: 'r5.xlarge', hourlyCost: 0.282, cpuCount: 4, ramGiB: 32),
            new InstanceType(id: 'R52xlarge', name: 'r5.2xlarge', hourlyCost: 0.564, cpuCount: 8, ramGiB: 64),
            new InstanceType(id: 'R54xlarge', name: 'r5.4xlarge', hourlyCost: 1.128, cpuCount: 16, ramGiB: 128),
            new InstanceType(id: 'R58xlarge', name: 'r5.8xlarge', hourlyCost: 2.256, cpuCount: 32, ramGiB: 256),
            new InstanceType(id: 'R516xlarge', name: 'r5.16xlarge', tag: 'r64', hourlyCost: 4.512, cpuCount: 64, ramGiB: 512),
            new InstanceType(id: 'G5Xlarge', name: 'g5.xlarge', tag: 'g4', hourlyCost: 1.123, cpuCount: 4, ramGiB: 16),
            new InstanceType(id: 'G52xlarge', name: 'g5.2xlarge', tag: 'g8', hourlyCost: 1.353, cpuCount: 8, ramGiB: 32),
            new InstanceType(id: 'G512xlarge', name: 'g5.12xlarge', tag: 'g48', hourlyCost: 6.332, cpuCount: 48, ramGiB: 192),
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
        new DockerInstanceProvisioner(new WorkerInstanceConfig(), instanceTypes, config.syslogAddress)
    }
}
