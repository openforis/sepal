package org.openforis.sepal.component.hostingservice.gcp

import org.openforis.sepal.component.hostingservice.internal.AbstractHostingService

import org.openforis.sepal.component.hostingservice.api.InstanceType

class GcpHostingService extends AbstractHostingService {
    GcpHostingService(List<InstanceType> instanceTypes, double storageCostPerGbMonth) {
        super(instanceTypes, storageCostPerGbMonth)
    }
}
