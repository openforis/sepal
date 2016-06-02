package org.openforis.sepal.component.hostingservice.aws

import org.openforis.sepal.component.budget.api.HostingService

class AwsHostingService implements HostingService {
    Map<String, Double> hourlyCostByInstanceType() {
        return null
    }

    double storageCostPerGbMonth() {
        return 0
    }

    double gbStorageUsed(String username) {
        return 0
    }
}
