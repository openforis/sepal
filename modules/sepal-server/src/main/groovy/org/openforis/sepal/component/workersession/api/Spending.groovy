package org.openforis.sepal.component.workersession.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class Spending {
    double monthlyInstanceBudget
    double monthlyInstanceSpending
    double monthlyStorageBudget
    double monthlyStorageSpending
    double storageQuota
    double storageUsed
}
