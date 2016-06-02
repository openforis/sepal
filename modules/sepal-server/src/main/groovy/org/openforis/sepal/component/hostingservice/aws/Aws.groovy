package org.openforis.sepal.component.hostingservice.aws

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.hostingservice.internal.InstanceType
import org.openforis.sepal.component.workerinstance.api.InstanceProvider

class Aws implements HostingServiceAdapter {
    private final config = new AwsConfig('/data/aws.properties')
    private final double storageCostPerGbMonth = 0.3d
    private final List<InstanceType> instanceTypes = [
            new InstanceType(id: 'T2Small', name: 't2.small', hourlyCost: 0.026, description: '1 CPU / 2 GiB'),
            new InstanceType(id: 'T2Medium', name: 't2.medium', hourlyCost: 0.052, description: '2 CPU / 4 GiB'),
            new InstanceType(id: 'T2Large', name: 't2.large', hourlyCost: 0.104, description: '2 CPU / 8 GiB'),
            new InstanceType(id: 'M3Medium', name: 'm3.medium', hourlyCost: 0.067, description: '1 CPU / 3.75 GiB'),
            new InstanceType(id: 'M4Large', name: 'm4.large', hourlyCost: 0.12, description: '2 CPU / 8 GiB'),
            new InstanceType(id: 'M4Xlarge', name: 'm4.xlarge', hourlyCost: 0.239, description: '4 CPU / 16 GiB'),
            new InstanceType(id: 'M42xlarge', name: 'm4.2xlarge', hourlyCost: 0.479, description: '8 CPU / 32 GiB'),
            new InstanceType(id: 'M44xlarge', name: 'm4.4xlarge', hourlyCost: 0.958, description: '16 CPU / 64 GiB'),
            new InstanceType(id: 'M410xlarge', name: 'm4.10xlarge', hourlyCost: 2.394, description: '40 CPU / 160 GiB'),
            new InstanceType(id: 'C4Large', name: 'c4.large', hourlyCost: 0.105, description: '2 CPU / 3.75 GiB'),
            new InstanceType(id: 'C4Xlarge', name: 'c4.xlarge', hourlyCost: 0.209, description: '4 CPU / 7.5 GiB'),
            new InstanceType(id: 'C42xlarge', name: 'c4.2xlarge', hourlyCost: 0.419, description: '8 CPU / 15 GiB'),
            new InstanceType(id: 'C44xlarge', name: 'c4.4xlarge', hourlyCost: 0.838, description: '16 CPU / 30 GiB'),
            new InstanceType(id: 'C48xlarge', name: 'c4.8xlarge', hourlyCost: 1.675, description: '36 CPU / 60 GiB'),
            new InstanceType(id: 'R3Large', name: 'r3.large', hourlyCost: 0.166, description: '2 CPU / 15 GiB'),
            new InstanceType(id: 'R3Xlarge', name: 'r3.xlarge', hourlyCost: 0.333, description: '4 CPU / 30.5 GiB'),
            new InstanceType(id: 'R32xlarge', name: 'r3.2xlarge', hourlyCost: 0.665, description: '8 CPU / 61 GiB'),
            new InstanceType(id: 'R34xlarge', name: 'r3.4xlarge', hourlyCost: 1.33, description: '16 CPU / 122 GiB'),
            new InstanceType(id: 'R38xlarge', name: 'r3.8xlarge', hourlyCost: 2.66, description: '32 CPU / 244 GiB')
    ]


    HostingService getHostingService() {
        return new AwsHostingService(instanceTypes, storageCostPerGbMonth)
    }

    InstanceProvider getInstanceProvider() {
        return new AwsInstanceProvider()
    }
}
