package org.openforis.sepal.component.budget.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class Budget {
    double instanceSpending
    double storageSpending
    double storageQuota
}
