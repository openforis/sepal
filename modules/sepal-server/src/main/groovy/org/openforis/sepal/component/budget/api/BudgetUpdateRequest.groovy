package org.openforis.sepal.component.budget.api

import groovy.transform.Immutable

@Immutable
class BudgetUpdateRequest {
    String message
    double instanceSpending
    double storageSpending
    double storageQuota
    Date creationTime
    Date updateTime
}
