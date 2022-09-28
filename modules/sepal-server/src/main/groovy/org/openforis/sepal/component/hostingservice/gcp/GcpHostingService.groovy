package org.openforis.sepal.component.hostingservice.aws

import org.openforis.sepal.component.hostingservice.internal.AbstractHostingService

import org.openforis.sepal.component.hostingservice.api.InstanceType

class AwsHostingService extends AbstractHostingService {
    AwsHostingService(List<InstanceType> instanceTypes, double storageCostPerGbMonth) {
        super(instanceTypes, storageCostPerGbMonth)
    }
}
