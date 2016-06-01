package org.openforis.sepal.component.budget.api

import groovy.transform.Immutable

@Immutable
class UserInstanceSpending {
    String username
    double instanceSpending
    double instanceBudget
}
