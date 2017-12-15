package org.openforis.sepal.component.hostingservice.local

import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.hostingservice.internal.AbstractHostingService

class LocalHostingService extends AbstractHostingService {
    LocalHostingService(
            List<InstanceType> instanceTypes,
            double storageCostPerGbMonth) {
        super(instanceTypes, storageCostPerGbMonth)
    }
}
