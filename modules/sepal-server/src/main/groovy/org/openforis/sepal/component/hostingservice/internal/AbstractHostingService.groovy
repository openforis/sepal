package org.openforis.sepal.component.hostingservice.internal

import org.openforis.sepal.component.budget.api.HostingService


abstract class AbstractHostingService implements HostingService {
    private final Map<String, Double> hourlyCostByInstanceType
    private final double storageCostPerGbMonth

    AbstractHostingService(List<InstanceType> instanceTypes, double storageCostPerGbMonth) {
        hourlyCostByInstanceType = instanceTypes.collectEntries {
            [(it.name): it.hourlyCost]
        }
        this.storageCostPerGbMonth = storageCostPerGbMonth
    }

    Map<String, Double> hourlyCostByInstanceType() {
        hourlyCostByInstanceType
    }

    double storageCostPerGbMonth() {
        return 0
    }
}
