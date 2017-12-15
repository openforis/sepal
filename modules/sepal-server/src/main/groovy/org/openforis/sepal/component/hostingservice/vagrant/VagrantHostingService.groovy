package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.hostingservice.internal.AbstractHostingService

import org.openforis.sepal.component.hostingservice.api.InstanceType

class VagrantHostingService extends AbstractHostingService {
    VagrantHostingService(
            List<InstanceType> instanceTypes,
            double storageCostPerGbMonth) {
        super(instanceTypes, storageCostPerGbMonth)
    }
}
