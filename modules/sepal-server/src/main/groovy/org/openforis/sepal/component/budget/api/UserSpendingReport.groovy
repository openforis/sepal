package org.openforis.sepal.component.budget.api

import groovy.transform.Immutable

@Immutable
class UserSpendingReport {
    String username
    double instanceSpending
    double storageSpending
    double storageUsage
    double instanceBudget
    double storageBudget
    double storageQuota
}
