package component.budget

import org.openforis.sepal.component.budget.api.HostingService

class FakeHostingService implements HostingService {
    private final hourlyCostByInstanceType = [:]
    private final Map<String, Double> gbStorageUsedByUsername = [:]
    private double storageCostPerGbMonth

    Map<String, Double> hourlyCostByInstanceType() {
        hourlyCostByInstanceType
    }

    void instanceTypeCost(String instanceType, double hourlyCost) {
        hourlyCostByInstanceType[instanceType] = hourlyCost
    }

    double storageCostPerGbMonth() {
        storageCostPerGbMonth
    }

    void storageCostPerGbMonth(double cost) {
        this.storageCostPerGbMonth = cost
    }

    double gbStorageUsed(String username) {
        gbStorageUsedByUsername[username]
    }

    void gbStorageUsed(String username, double cost) {
        gbStorageUsedByUsername[username] = cost
    }
}
