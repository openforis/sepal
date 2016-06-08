package org.openforis.sepal.component.budget.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class UserInstanceSpending {
    String username
    double spending
    double budget

    boolean isBudgetExceeded() {
        spending > budget
    }
}
