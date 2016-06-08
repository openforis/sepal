package org.openforis.sepal.component.budget.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class UserSpendingReport {
    String username
    double instanceSpending
    double storageSpending
    double storageUsage
    double instanceBudget
    double storageBudget
    double storageQuota
}
