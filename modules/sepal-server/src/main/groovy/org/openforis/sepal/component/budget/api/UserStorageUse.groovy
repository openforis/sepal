package org.openforis.sepal.component.budget.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class UserStorageUse {
    String username
    double spending
    double use
    double budget
    double quota

    boolean isBudgetExceeded() {
        spending > budget
    }

    boolean isQuotaExceeded() {
        use > quota
    }
}
