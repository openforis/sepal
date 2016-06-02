package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.budget.api.HostingService

class VagrantHostingService implements HostingService {
    private final double storageCostPerGbMonth = 0.3d

    Map<String, Double> hourlyCostByInstanceType() {
        return null
    }


    double storageCostPerGbMonth() {
        return storageCostPerGbMonth
    }

    double gbStorageUsed(String username) {
        return 0
    }
}
