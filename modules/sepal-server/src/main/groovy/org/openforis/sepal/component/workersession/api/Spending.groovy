package org.openforis.sepal.component.workersession.api

import groovy.transform.Immutable

@Immutable
class Spending {
    double monthlyInstanceBudget
    double monthlyInstanceSpending
    double monthlyStorageBudget
    double monthlyStorageSpending
    double storageQuota
    double storageUsed
}
