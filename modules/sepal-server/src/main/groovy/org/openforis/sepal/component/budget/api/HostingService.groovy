package org.openforis.sepal.component.budget.api

interface HostingService {
    Map<String, Double> hourlyCostByInstanceType()

    double storageCostPerGbMonth()

    double gbStorageUsed(String username)
}
